'use client'

import { useState, useEffect, useCallback } from 'react'

// ============================================================================
// Page permission registry (mirrored from lib/permissions.ts for client use)
// ============================================================================

interface PageDef {
  key: string
  label: string
  section: string
}

const ALL_PAGES: PageDef[] = [
  { key: 'dashboard', label: 'Dashboard', section: 'Operations' },
  { key: 'all-orders', label: 'All Orders', section: 'Operations' },
  { key: 'expedited', label: 'Expedited Orders', section: 'Operations' },
  { key: 'errors', label: 'Error Orders', section: 'Operations' },
  { key: 'hold', label: 'Orders on Hold', section: 'Operations' },
  { key: 'singles', label: 'Singles', section: 'Operations' },
  { key: 'bulk', label: 'Bulk Orders', section: 'Operations' },
  { key: 'box-size', label: 'Orders by Size', section: 'Operations' },
  { key: 'personalized-orders', label: 'Personalized Orders', section: 'Operations' },
  { key: 'international', label: 'International Orders', section: 'Operations' },
  { key: 'batch-queue', label: 'Batch Queue', section: 'Operations' },
  { key: 'pick', label: 'Picker', section: 'Warehouse' },
  { key: 'personalization', label: 'Engraving Station', section: 'Warehouse' },
  { key: 'cart-scan', label: 'Cart Scan', section: 'Warehouse' },
  { key: 'scan-to-verify', label: 'Scan to Verify', section: 'Warehouse' },
  { key: 'local-pickup', label: 'Local Pickup Orders', section: 'Warehouse' },
  { key: 'returns', label: 'Receive Returns', section: 'Warehouse' },
  { key: 'inventory-count', label: 'Inventory Count', section: 'Warehouse' },
  { key: 'analytics', label: 'Analytics', section: 'Reports' },
]

function getPagesBySection(): Record<string, PageDef[]> {
  const grouped: Record<string, PageDef[]> = {}
  for (const p of ALL_PAGES) {
    if (!grouped[p.section]) grouped[p.section] = []
    grouped[p.section].push(p)
  }
  return grouped
}

// ============================================================================
// Types
// ============================================================================

interface PermGroup {
  id: string
  name: string
  description: string | null
  isDefault: boolean
  pageKeys: string[]
  userCount: number
}

interface AppUser {
  id: string
  netsuiteEmpId: string | null
  name: string
  isAdmin: boolean
  groupId: string | null
  groupName: string | null
  isDefaultGroup: boolean
  lastLoginAt: string | null
  active: boolean
}

// ============================================================================
// Component
// ============================================================================

export default function UsersPermissionsPage() {
  const [tab, setTab] = useState<'groups' | 'users'>('groups')
  const [groups, setGroups] = useState<PermGroup[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  // Groups UI state
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [newGroupPages, setNewGroupPages] = useState<string[]>([])
  const [savingGroup, setSavingGroup] = useState(false)
  const [editingPages, setEditingPages] = useState<Record<string, string[]>>({})
  const [savingPages, setSavingPages] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Users search
  const [userSearch, setUserSearch] = useState('')

  // ---- Data fetching ----

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/permission-groups')
      if (res.ok) {
        const data = await res.json()
        setGroups(data.groups || [])
      }
    } catch (err) {
      console.error('Failed to fetch groups:', err)
    }
  }, [])

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users/manage')
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
      }
    } catch (err) {
      console.error('Failed to fetch users:', err)
    }
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      await Promise.all([fetchGroups(), fetchUsers()])
      setLoading(false)
    }
    load()
  }, [fetchGroups, fetchUsers])

  // ---- Group actions ----

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return
    setSavingGroup(true)
    try {
      const res = await fetch('/api/permission-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName.trim(),
          description: newGroupDesc.trim() || null,
          pageKeys: newGroupPages,
        }),
      })
      if (res.ok) {
        setCreatingGroup(false)
        setNewGroupName('')
        setNewGroupDesc('')
        setNewGroupPages([])
        await fetchGroups()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to create group')
      }
    } catch {
      alert('Failed to create group')
    }
    setSavingGroup(false)
  }

  const handleSavePages = async (groupId: string) => {
    const pages = editingPages[groupId]
    if (!pages) return
    setSavingPages(groupId)
    try {
      const res = await fetch(`/api/permission-groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageKeys: pages }),
      })
      if (res.ok) {
        await fetchGroups()
        // Remove from editing state
        setEditingPages((prev) => {
          const next = { ...prev }
          delete next[groupId]
          return next
        })
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to save permissions')
      }
    } catch {
      alert('Failed to save permissions')
    }
    setSavingPages(null)
  }

  const handleToggleDefault = async (groupId: string, currentDefault: boolean) => {
    try {
      await fetch(`/api/permission-groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: !currentDefault }),
      })
      await fetchGroups()
    } catch {
      alert('Failed to update default')
    }
  }

  const handleDeleteGroup = async (groupId: string) => {
    try {
      const res = await fetch(`/api/permission-groups/${groupId}`, { method: 'DELETE' })
      if (res.ok) {
        setDeleteConfirm(null)
        await fetchGroups()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete group')
      }
    } catch {
      alert('Failed to delete group')
    }
  }

  // ---- User actions ----

  const handleAssignGroup = async (userId: string, groupId: string | null) => {
    try {
      const res = await fetch('/api/users/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, groupId }),
      })
      if (res.ok) {
        await fetchUsers()
      }
    } catch {
      alert('Failed to assign group')
    }
  }

  const handleSyncNetSuite = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/users/sync', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setSyncResult(`Synced ${data.synced} employees: ${data.created} new, ${data.updated} updated`)
        await fetchUsers()
      } else {
        setSyncResult(data.error || 'Sync failed')
      }
    } catch {
      setSyncResult('Failed to sync')
    }
    setSyncing(false)
  }

  // ---- Page toggle helpers ----

  const togglePageInList = (list: string[], key: string): string[] => {
    return list.includes(key) ? list.filter((k) => k !== key) : [...list, key]
  }

  const toggleAllInSection = (list: string[], section: string): string[] => {
    const sectionKeys = ALL_PAGES.filter((p) => p.section === section).map((p) => p.key)
    const allSelected = sectionKeys.every((k) => list.includes(k))
    if (allSelected) {
      return list.filter((k) => !sectionKeys.includes(k))
    }
    return Array.from(new Set([...list, ...sectionKeys]))
  }

  // ---- Filtered users ----

  const filteredUsers = userSearch
    ? users.filter(
        (u) =>
          u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
          (u.netsuiteEmpId && u.netsuiteEmpId.includes(userSearch)) ||
          (u.groupName && u.groupName.toLowerCase().includes(userSearch.toLowerCase()))
      )
    : users

  // ---- Render helpers ----

  const pagesBySection = getPagesBySection()

  function renderPageCheckboxes(
    selectedPages: string[],
    onToggle: (key: string) => void,
    onToggleSection: (section: string) => void
  ) {
    return (
      <div className="space-y-4">
        {Object.entries(pagesBySection).map(([section, pages]) => {
          const allSelected = pages.every((p) => selectedPages.includes(p.key))
          const someSelected = pages.some((p) => selectedPages.includes(p.key))
          return (
            <div key={section}>
              <label className="flex items-center gap-2 mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
                  onChange={() => onToggleSection(section)}
                  className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <span className="text-sm font-semibold text-gray-700">{section}</span>
              </label>
              <div className="ml-6 grid grid-cols-2 md:grid-cols-3 gap-1">
                {pages.map((page) => (
                  <label key={page.key} className="flex items-center gap-2 cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={selectedPages.includes(page.key)}
                      onChange={() => onToggle(page.key)}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-600">{page.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ---- Loading ----

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Users &amp; Permissions</h1>
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-2xl font-bold mb-1">Users &amp; Permissions</h1>
      <p className="text-gray-500 text-sm mb-6">
        Manage permission groups and assign users. Admins (from NetSuite) always have full access.
      </p>

      {/* Tab Switcher */}
      <div className="flex gap-1 mb-6 bg-gray-200 p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab('groups')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'groups' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Groups ({groups.length})
        </button>
        <button
          onClick={() => setTab('users')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'users' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Users ({users.length})
        </button>
      </div>

      {/* ================================================================ */}
      {/* GROUPS TAB                                                       */}
      {/* ================================================================ */}
      {tab === 'groups' && (
        <div className="space-y-4">
          {/* Create Group Button */}
          {!creatingGroup && (
            <button
              onClick={() => setCreatingGroup(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              + Create Group
            </button>
          )}

          {/* Create Group Form */}
          {creatingGroup && (
            <div className="bg-white border border-green-300 rounded-xl p-5 shadow-sm">
              <h3 className="text-lg font-semibold mb-4">New Permission Group</h3>
              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Group Name *</label>
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="e.g., Team Leads"
                    className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                    placeholder="Optional description"
                    className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>

              <h4 className="text-sm font-semibold text-gray-700 mb-2">Page Access</h4>
              {renderPageCheckboxes(
                newGroupPages,
                (key) => setNewGroupPages((prev) => togglePageInList(prev, key)),
                (section) => setNewGroupPages((prev) => toggleAllInSection(prev, section))
              )}

              <div className="flex gap-2 mt-5">
                <button
                  onClick={handleCreateGroup}
                  disabled={savingGroup || !newGroupName.trim()}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {savingGroup ? 'Creating...' : 'Create Group'}
                </button>
                <button
                  onClick={() => {
                    setCreatingGroup(false)
                    setNewGroupName('')
                    setNewGroupDesc('')
                    setNewGroupPages([])
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Group List */}
          {groups.map((group) => {
            const isExpanded = expandedGroupId === group.id
            const currentPages = editingPages[group.id] ?? group.pageKeys
            const hasChanges = editingPages[group.id] !== undefined

            return (
              <div key={group.id} className="bg-white border border-gray-200 rounded-xl shadow-sm">
                {/* Group header */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
                >
                  <div className="flex items-center gap-3">
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{group.name}</span>
                        {group.isDefault && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                            Default
                          </span>
                        )}
                      </div>
                      {group.description && (
                        <p className="text-sm text-gray-500 mt-0.5">{group.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">
                      {group.userCount} user{group.userCount !== 1 ? 's' : ''} &middot;{' '}
                      {group.pageKeys.length} page{group.pageKeys.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-gray-100 pt-4">
                    {/* Page checkboxes */}
                    {renderPageCheckboxes(
                      currentPages,
                      (key) =>
                        setEditingPages((prev) => ({
                          ...prev,
                          [group.id]: togglePageInList(currentPages, key),
                        })),
                      (section) =>
                        setEditingPages((prev) => ({
                          ...prev,
                          [group.id]: toggleAllInSection(currentPages, section),
                        }))
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
                      <div className="flex gap-2">
                        {hasChanges && (
                          <>
                            <button
                              onClick={() => handleSavePages(group.id)}
                              disabled={savingPages === group.id}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:bg-gray-400 transition-colors"
                            >
                              {savingPages === group.id ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button
                              onClick={() =>
                                setEditingPages((prev) => {
                                  const next = { ...prev }
                                  delete next[group.id]
                                  return next
                                })
                              }
                              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                      <div className="flex gap-2 items-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleToggleDefault(group.id, group.isDefault)
                          }}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            group.isDefault
                              ? 'bg-blue-50 border-blue-300 text-blue-700'
                              : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {group.isDefault ? 'Default Group' : 'Set as Default'}
                        </button>
                        {deleteConfirm === group.id ? (
                          <div className="flex gap-1 items-center">
                            <span className="text-xs text-red-600 mr-1">Are you sure?</span>
                            <button
                              onClick={() => handleDeleteGroup(group.id)}
                              className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteConfirm(group.id)
                            }}
                            className="px-3 py-1.5 text-xs font-medium border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {groups.length === 0 && !creatingGroup && (
            <div className="text-gray-500 text-sm py-8 text-center">
              No groups yet. Create one to get started.
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* USERS TAB                                                        */}
      {/* ================================================================ */}
      {tab === 'users' && (
        <div>
          {/* Controls row */}
          <div className="flex items-center gap-3 mb-4">
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search users..."
              className="flex-1 max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <button
              onClick={handleSyncNetSuite}
              disabled={syncing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {syncing ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Syncing...
                </>
              ) : (
                'Sync from NetSuite'
              )}
            </button>
          </div>

          {/* Sync result message */}
          {syncResult && (
            <div className="mb-4 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              {syncResult}
            </div>
          )}

          {/* Users table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Emp ID</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Group</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Admin</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Last Login</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{user.name}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                      {user.netsuiteEmpId || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={user.groupId || ''}
                        onChange={(e) =>
                          handleAssignGroup(user.id, e.target.value || null)
                        }
                        className="px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      >
                        <option value="">— No Group —</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name} {g.isDefault ? '(Default)' : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {user.isAdmin ? (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                          Admin
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : 'Never'}
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      {userSearch
                        ? 'No users match your search.'
                        : 'No users yet. Click "Sync from NetSuite" to pull your employee list.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Info note */}
          <p className="text-xs text-gray-400 mt-3">
            Group changes take effect on the user&apos;s next login. Admin access comes from NetSuite and cannot be changed here.
          </p>
        </div>
      )}
    </div>
  )
}
