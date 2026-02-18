'use client'

import { useState, useEffect } from 'react'
import { Carrier, RateShopper, WeightRuleLocal } from './types'
import { MAX_OZ, CATCHALL_OZ, SEGMENT_COLORS, formatWeight, formatSegmentRange, isCatchAll } from './helpers'

export function WeightRulesTab() {
  const [rules, setRules] = useState<WeightRuleLocal[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Carriers and rate shoppers for dropdowns
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [rateShoppers, setRateShoppers] = useState<RateShopper[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)

  // Editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  useEffect(() => {
    fetchRules()
    fetchOptions()
  }, [])

  async function fetchRules() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/weight-rules')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch')
      // Load rules as-is (last segment may have maxOz = CATCHALL_OZ which is fine)
      // Clamp non-last segments to MAX_OZ, keep last segment's catch-all value
      const rawRules = (data.rules || []) as any[]
      const loaded = rawRules
        .map((r: any, idx: number) => {
          const isLast = idx === rawRules.length - 1
          return {
            id: r.id,
            minOz: Math.min(r.minOz, MAX_OZ),
            maxOz: isLast ? (r.maxOz > MAX_OZ ? r.maxOz : r.maxOz) : Math.min(r.maxOz, MAX_OZ),
            targetType: r.targetType,
            carrierId: r.carrierId,
            carrierCode: r.carrierCode,
            serviceCode: r.serviceCode,
            serviceName: r.serviceName,
            rateShopperId: r.rateShopperId,
            rateShopper: r.rateShopper,
            isActive: r.isActive,
          }
        })
        .filter((r: any) => r.minOz < r.maxOz)
      setRules(loaded)
      // If the last segment isn't already catch-all, mark unsaved so user can save to fix it
      const lastRule = rawRules[rawRules.length - 1]
      const needsCatchAll = lastRule && lastRule.maxOz <= MAX_OZ
      setHasChanges(needsCatchAll)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function fetchOptions() {
    try {
      setLoadingOptions(true)
      const [carriersRes, rateShoppersRes, settingsRes] = await Promise.all([
        fetch('/api/shipengine/carriers?includeServices=true'),
        fetch('/api/rate-shoppers'),
        fetch('/api/settings'),
      ])
      const carriersData = await carriersRes.json()
      const rateShoppersData = await rateShoppersRes.json()
      const settingsData = await settingsRes.json()

      // Build set of selected service keys
      const keys = new Set<string>()
      const selectedSetting = settingsData.settings?.find((s: { key: string }) => s.key === 'selected_services')
      if (selectedSetting?.value?.services) {
        for (const svc of selectedSetting.value.services) {
          keys.add(`${svc.carrierId}:${svc.serviceCode}`)
        }
      }

      if (carriersRes.ok && carriersData.carriers) {
        const filtered = (carriersData.carriers as Carrier[])
          .map((carrier) => ({
            ...carrier,
            services: (carrier.services || []).filter(
              (s) => keys.size === 0 || keys.has(`${carrier.carrier_id}:${s.service_code}`)
            ),
          }))
          .filter((carrier) => carrier.services.length > 0)
        setCarriers(filtered)
      }
      if (rateShoppersRes.ok && rateShoppersData.rateShoppers) setRateShoppers(rateShoppersData.rateShoppers)
    } catch (err) {
      console.error('Error fetching options:', err)
    } finally {
      setLoadingOptions(false)
    }
  }

  function addBreakpoint() {
    if (rules.length === 0) {
      // First rule: entire range catch-all
      setRules([{ minOz: 0, maxOz: CATCHALL_OZ, targetType: 'service', isActive: true }])
    } else {
      // Split the last segment: put a breakpoint at a sensible spot within the visual range
      const lastIdx = rules.length - 1
      const last = rules[lastIdx]
      // For the visual split, use the lesser of maxOz and MAX_OZ
      const visualMax = Math.min(last.maxOz, MAX_OZ)
      const midpoint = Math.round((last.minOz + visualMax) / 2)

      if (midpoint <= last.minOz) return // Can't split further

      const newRules = [...rules]
      newRules[lastIdx] = { ...last, maxOz: midpoint }
      newRules.push({
        minOz: midpoint,
        maxOz: CATCHALL_OZ, // New last segment is always catch-all
        targetType: 'service',
        isActive: true,
      })
      setRules(newRules)
    }
    setHasChanges(true)
  }

  function splitSegment(index: number) {
    const seg = rules[index]
    const isLast = index === rules.length - 1
    // For catch-all last segment, split within the visual range
    const visualMax = isLast ? Math.min(seg.maxOz, MAX_OZ) : seg.maxOz
    const midpoint = Math.round((seg.minOz + visualMax) / 2)
    if (midpoint <= seg.minOz) return

    const newRules = [...rules]
    newRules.splice(index, 1,
      { ...seg, maxOz: midpoint },
      { minOz: midpoint, maxOz: seg.maxOz, targetType: 'service', isActive: true }
    )
    setRules(newRules)
    setHasChanges(true)
  }

  function removeSegment(index: number) {
    if (rules.length <= 1) {
      setRules([])
      setHasChanges(true)
      return
    }

    const newRules = [...rules]
    const removed = newRules[index]

    if (index === 0) {
      // Expand next segment down
      newRules[1] = { ...newRules[1], minOz: removed.minOz }
    } else {
      // Expand previous segment up
      newRules[index - 1] = { ...newRules[index - 1], maxOz: removed.maxOz }
    }

    newRules.splice(index, 1)

    // Ensure the new last segment is always catch-all
    if (newRules.length > 0) {
      const lastIdx = newRules.length - 1
      if (newRules[lastIdx].maxOz <= MAX_OZ) {
        newRules[lastIdx] = { ...newRules[lastIdx], maxOz: CATCHALL_OZ }
      }
    }

    setRules(newRules)
    setHasChanges(true)
    if (editingIndex === index) setEditingIndex(null)
  }

  function updateSegmentTarget(index: number, update: Partial<WeightRuleLocal>) {
    const newRules = [...rules]
    newRules[index] = { ...newRules[index], ...update }
    setRules(newRules)
    setHasChanges(true)
  }

  function updateBreakpoint(index: number, newMaxOz: number) {
    // index is the segment whose maxOz we're changing
    // This also changes the next segment's minOz
    if (index >= rules.length - 1) return
    // For the boundary before the last (catch-all) segment, cap at MAX_OZ
    const nextMaxForCheck = isCatchAll(rules[index + 1].maxOz) ? MAX_OZ : rules[index + 1].maxOz
    if (newMaxOz <= rules[index].minOz || newMaxOz >= nextMaxForCheck) return

    const newRules = [...rules]
    newRules[index] = { ...newRules[index], maxOz: newMaxOz }
    newRules[index + 1] = { ...newRules[index + 1], minOz: newMaxOz }
    setRules(newRules)
    setHasChanges(true)
  }

  async function handleSave() {
    try {
      setSaving(true)
      // Ensure last segment is always catch-all before saving
      const rulesToSave = rules.map((r, i) => ({
        minOz: r.minOz,
        maxOz: i === rules.length - 1 ? CATCHALL_OZ : r.maxOz,
        targetType: r.targetType,
        carrierId: r.carrierId || null,
        carrierCode: r.carrierCode || null,
        serviceCode: r.serviceCode || null,
        serviceName: r.serviceName || null,
        rateShopperId: r.rateShopperId || null,
        isActive: r.isActive,
      }))
      const payload = { rules: rulesToSave }

      const res = await fetch('/api/weight-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')

      setRules((data.rules || []).map((r: any) => ({
        id: r.id,
        minOz: r.minOz,
        maxOz: r.maxOz,
        targetType: r.targetType,
        carrierId: r.carrierId,
        carrierCode: r.carrierCode,
        serviceCode: r.serviceCode,
        serviceName: r.serviceName,
        rateShopperId: r.rateShopperId,
        rateShopper: r.rateShopper,
        isActive: r.isActive,
      })))
      setHasChanges(false)
      setEditingIndex(null)
    } catch (err: any) {
      alert(err.message || 'Failed to save weight rules')
    } finally {
      setSaving(false)
    }
  }

  function getSegmentLabel(rule: WeightRuleLocal): string {
    if (rule.targetType === 'rate_shopper') {
      return rule.rateShopper?.name || 'Rate Shopper'
    }
    return rule.serviceName || 'Unassigned'
  }

  // Build flat list of carrier services for dropdown
  const allServices = carriers.flatMap((carrier) =>
    (carrier.services || [])
      .filter((s) => s.domestic)
      .map((service) => ({
        carrierId: carrier.carrier_id,
        carrierCode: carrier.carrier_code,
        carrierName: carrier.friendly_name,
        serviceCode: service.service_code,
        serviceName: service.name,
      }))
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-gray-600">
            Define weight ranges and assign a carrier service or rate shopper to each.
            Orders are matched by their calculated weight at ingest time.
          </p>
        </div>
        <div className="flex items-center gap-3 ml-4 shrink-0">
          {hasChanges && (
            <button
              onClick={fetchRules}
              className="px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Discard
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
          >
            {saving ? 'Saving...' : 'Save Rules'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-800 font-semibold">Error</p>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Loading weight rules...</div>
        </div>
      ) : (
        <>
          {/* Visual Range Bar - equal-width segments */}
          {rules.length > 0 && (
            <div className="mb-6">
              <div className="flex h-12 rounded-lg overflow-hidden border border-gray-300">
                {rules.map((rule, i) => {
                  const isLast = i === rules.length - 1
                  const colorClass = SEGMENT_COLORS[i % SEGMENT_COLORS.length]
                  const isUnassigned = rule.targetType === 'service' && !rule.serviceCode
                  const rangeLabel = formatSegmentRange(rule, isLast)

                  return (
                    <div
                      key={i}
                      className={`relative flex flex-col items-center justify-center cursor-pointer transition-opacity border-r border-white/30 last:border-r-0 ${
                        isUnassigned ? 'bg-gray-300' : colorClass
                      } ${!rule.isActive ? 'opacity-40' : ''} ${editingIndex === i ? 'ring-2 ring-offset-1 ring-blue-400 z-10' : ''}`}
                      style={{ width: `${100 / rules.length}%` }}
                      onClick={() => setEditingIndex(editingIndex === i ? null : i)}
                      title={`${rangeLabel}: ${getSegmentLabel(rule)}`}
                    >
                      <span className="text-white text-[11px] font-semibold truncate px-1 leading-tight">
                        {rangeLabel}
                      </span>
                      <span className="text-white/80 text-[10px] truncate px-1 leading-tight">
                        {isUnassigned ? 'Unassigned' : getSegmentLabel(rule)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Empty State */}
          {rules.length === 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center mb-6">
              <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
              </svg>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">No Weight Rules</h3>
              <p className="text-gray-500 mb-4">
                Add weight-based routing rules to automatically assign carriers based on package weight.
              </p>
              <button
                onClick={addBreakpoint}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create Your First Rule
              </button>
            </div>
          )}

          {/* Segments List */}
          {rules.length > 0 && (
            <div className="space-y-2 mb-4">
              {rules.map((rule, i) => {
                const isEditing = editingIndex === i
                const colorClass = SEGMENT_COLORS[i % SEGMENT_COLORS.length]
                const isUnassigned = rule.targetType === 'service' && !rule.serviceCode

                return (
                  <div
                    key={i}
                    className={`border rounded-lg overflow-hidden ${
                      isEditing ? 'border-blue-400 shadow-md' : 'border-gray-200'
                    }`}
                  >
                    {/* Segment Header */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50"
                      onClick={() => setEditingIndex(isEditing ? null : i)}
                    >
                      <div className={`w-3 h-3 rounded-full ${isUnassigned ? 'bg-gray-300' : colorClass}`} />
                      <div className="flex-1">
                        <span className="text-sm font-medium">
                          {formatSegmentRange(rule, i === rules.length - 1)}
                        </span>
                        <span className="text-sm text-gray-500 ml-3">
                          {isUnassigned ? (
                            <span className="text-amber-600 italic">Unassigned</span>
                          ) : (
                            getSegmentLabel(rule)
                          )}
                        </span>
                        {rule.targetType === 'rate_shopper' && (
                          <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Rate Shop</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); splitSegment(i) }}
                          className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1"
                          title="Split this segment"
                        >
                          Split
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeSegment(i) }}
                          className="text-xs text-red-600 hover:text-red-800 px-2 py-1"
                          title="Remove this segment"
                        >
                          Remove
                        </button>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform ${isEditing ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Expanded Edit Section */}
                    {isEditing && (
                      <div className="border-t border-gray-200 bg-gray-50 p-4 space-y-4">
                        {/* Breakpoint editor */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Min Weight (oz)</label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={rule.minOz}
                              disabled={i === 0}
                              className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm disabled:bg-gray-100 disabled:text-gray-500"
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0
                                if (i > 0) updateBreakpoint(i - 1, val)
                              }}
                            />
                            <span className="text-xs text-gray-400">{formatWeight(rule.minOz)}</span>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Max Weight (oz)</label>
                            {i === rules.length - 1 ? (
                              <div className="w-full px-3 py-1.5 border border-gray-200 rounded text-sm bg-gray-100 text-gray-500">
                                No limit (catch-all)
                              </div>
                            ) : (
                              <>
                                <input
                                  type="number"
                                  min={rule.minOz + 1}
                                  max={MAX_OZ}
                                  step={1}
                                  value={rule.maxOz}
                                  className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm"
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0
                                    updateBreakpoint(i, val)
                                  }}
                                />
                                <span className="text-xs text-gray-400">{formatWeight(rule.maxOz)}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Target Type Selector */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Assign To</label>
                          <div className="flex gap-4 mb-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`targetType-${i}`}
                                checked={rule.targetType === 'service'}
                                onChange={() => updateSegmentTarget(i, {
                                  targetType: 'service',
                                  rateShopperId: undefined,
                                  rateShopper: null,
                                })}
                                className="text-blue-600"
                              />
                              <span className="text-sm">Carrier Service</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`targetType-${i}`}
                                checked={rule.targetType === 'rate_shopper'}
                                onChange={() => updateSegmentTarget(i, {
                                  targetType: 'rate_shopper',
                                  carrierId: undefined,
                                  carrierCode: undefined,
                                  serviceCode: undefined,
                                  serviceName: undefined,
                                })}
                                className="text-blue-600"
                              />
                              <span className="text-sm">Rate Shopper</span>
                            </label>
                          </div>

                          {/* Service Picker */}
                          {rule.targetType === 'service' && (
                            <select
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              value={rule.serviceCode || ''}
                              onChange={(e) => {
                                const svc = allServices.find((s) => s.serviceCode === e.target.value)
                                if (svc) {
                                  updateSegmentTarget(i, {
                                    carrierId: svc.carrierId,
                                    carrierCode: svc.carrierCode,
                                    serviceCode: svc.serviceCode,
                                    serviceName: svc.serviceName,
                                  })
                                } else {
                                  updateSegmentTarget(i, {
                                    carrierId: undefined,
                                    carrierCode: undefined,
                                    serviceCode: undefined,
                                    serviceName: undefined,
                                  })
                                }
                              }}
                            >
                              <option value="">-- Select a carrier service --</option>
                              {carriers.map((carrier) => (
                                <optgroup key={carrier.carrier_id} label={carrier.friendly_name}>
                                  {(carrier.services || []).filter((s) => s.domestic).map((service) => (
                                    <option key={`${carrier.carrier_id}-${service.service_code}`} value={service.service_code}>
                                      {service.name}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          )}

                          {/* Rate Shopper Picker */}
                          {rule.targetType === 'rate_shopper' && (
                            <select
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              value={rule.rateShopperId || ''}
                              onChange={(e) => {
                                const rs = rateShoppers.find((r) => r.id === e.target.value)
                                updateSegmentTarget(i, {
                                  rateShopperId: e.target.value || undefined,
                                  rateShopper: rs ? { id: rs.id, name: rs.name, active: rs.active } : null,
                                })
                              }}
                            >
                              <option value="">-- Select a rate shopper --</option>
                              {rateShoppers.filter((rs) => rs.active).map((rs) => (
                                <option key={rs.id} value={rs.id}>
                                  {rs.name} {rs.isDefault ? '(Default)' : ''}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Add Segment / Split Button */}
          {rules.length > 0 && rules[rules.length - 1].maxOz < MAX_OZ && (
            <button
              onClick={addBreakpoint}
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Segment
            </button>
          )}

          {rules.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={addBreakpoint}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Split Last Segment
              </button>
              {hasChanges && (
                <span className="text-sm text-amber-600">Unsaved changes</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
