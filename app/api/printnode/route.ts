import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  fetchPrintNodePrinters,
  submitPrintJob,
  isPrintNodeConfigured,
  getPrinterConfigMap,
  savePrinterConfigs,
  fetchScalesForComputer,
  fetchAllScales,
  getScaleWeight,
  getScaleConfigMap,
  saveScaleFriendlyName,
  type MergedPrinter,
} from '@/lib/printnode'

// ============================================================================
// GET - Fetch printers + settings
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'printers') {
      if (!isPrintNodeConfigured()) {
        return NextResponse.json({
          configured: false,
          printers: [],
          grouped: {},
          error: 'PRINT_NODE environment variable not set',
        })
      }

      // Fetch live printers from PrintNode + saved configs from DB
      const [livePrinters, configMap] = await Promise.all([
        fetchPrintNodePrinters(),
        getPrinterConfigMap(prisma),
      ])

      // Merge live data with saved config (enabled, default, friendly name, computer friendly name)
      const merged: MergedPrinter[] = livePrinters.map((p) => {
        const saved = configMap.get(p.id)
        return {
          ...p,
          friendlyName: saved?.friendlyName || '',
          enabled: saved?.enabled ?? true, // new printers default to enabled
          isDefault: saved?.isDefault ?? false,
          computerFriendlyName: saved?.computerFriendlyName || '',
        }
      })

      // Group by computer
      const grouped: Record<string, MergedPrinter[]> = {}
      for (const printer of merged) {
        const computerName = printer.computer.name
        if (!grouped[computerName]) grouped[computerName] = []
        grouped[computerName].push(printer)
      }

      return NextResponse.json({
        configured: true,
        printers: merged,
        grouped,
      })
    }

    // For cart-scan: get enabled printers grouped by online computers
    if (action === 'computers') {
      if (!isPrintNodeConfigured()) {
        return NextResponse.json({ computers: [] })
      }

      const [livePrinters, configMap] = await Promise.all([
        fetchPrintNodePrinters(),
        getPrinterConfigMap(prisma),
      ])

      // Build computer list with only enabled printers on connected computers
      const computerMap: Record<string, {
        id: number
        name: string
        friendlyName: string
        state: string
        printers: { id: number; name: string; friendlyName: string; isDefault: boolean }[]
        scales: { deviceName: string; deviceNum: number; friendlyName: string }[]
      }> = {}

      // Fetch scale friendly names for the computers endpoint
      const scaleConfigMap = await getScaleConfigMap(prisma)

      for (const p of livePrinters) {
        const saved = configMap.get(p.id)
        const enabled = saved?.enabled ?? true

        if (!enabled) continue // skip disabled printers
        if (p.computer.state !== 'connected') continue // skip offline computers

        if (!computerMap[p.computer.name]) {
          computerMap[p.computer.name] = {
            id: p.computer.id,
            name: p.computer.name,
            friendlyName: saved?.computerFriendlyName || '',
            state: p.computer.state,
            printers: [],
            scales: [],
          }
        }
        // Update friendlyName if we find a saved one (any printer on this computer can carry it)
        if (saved?.computerFriendlyName && !computerMap[p.computer.name].friendlyName) {
          computerMap[p.computer.name].friendlyName = saved.computerFriendlyName
        }
        computerMap[p.computer.name].printers.push({
          id: p.id,
          name: p.name,
          friendlyName: saved?.friendlyName || '',
          isDefault: saved?.isDefault ?? false,
        })
      }

      // Only return computers that have at least 1 enabled printer
      const computers = Object.values(computerMap).filter(c => c.printers.length > 0)

      // Fetch scales for all connected computers and attach to the computer objects
      try {
        const computerIds = computers.map(c => c.id)
        const allScales = await fetchAllScales(computerIds)
        for (const comp of computers) {
          const compScales = allScales[comp.id]
          if (compScales) {
            comp.scales = compScales.map(s => {
              const key = `${comp.id}:${s.deviceName}:${s.deviceNum}`
              return {
                deviceName: s.deviceName,
                deviceNum: s.deviceNum,
                friendlyName: scaleConfigMap.get(key)?.friendlyName || '',
              }
            })
          }
        }
      } catch (err) {
        console.error('[PrintNode] Failed to fetch scales for computers endpoint:', err)
        // Non-fatal: computers still returned without scale info
      }

      return NextResponse.json({ computers })
    }

    // Fetch scales for a specific computer or all connected computers
    if (action === 'scales') {
      if (!isPrintNodeConfigured()) {
        return NextResponse.json({ scales: {}, scaleConfigs: {} })
      }

      const scaleConfigMap = await getScaleConfigMap(prisma)

      // Build a friendlyNames map for the frontend
      const friendlyNames: Record<string, string> = {}
      scaleConfigMap.forEach((cfg, key) => {
        if (cfg.friendlyName) friendlyNames[key] = cfg.friendlyName
      })

      const computerId = searchParams.get('computerId')
      
      if (computerId) {
        // Single computer
        const id = parseInt(computerId, 10)
        if (isNaN(id)) {
          return NextResponse.json({ error: 'Invalid computerId' }, { status: 400 })
        }
        const scales = await fetchScalesForComputer(id)
        return NextResponse.json({ scales: { [id]: scales }, friendlyNames })
      }

      // All computers: get unique computer IDs from live printers
      const livePrinters = await fetchPrintNodePrinters()
      const computerIds = Array.from(new Set(livePrinters.map(p => p.computer.id)))
      const scales = await fetchAllScales(computerIds)
      return NextResponse.json({ scales, friendlyNames })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error: any) {
    console.error('[PrintNode API] GET error:', error)
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 })
  }
}

// ============================================================================
// POST - Save settings or test print
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    if (action === 'save-settings') {
      const { printers } = body
      if (!Array.isArray(printers)) {
        return NextResponse.json({ error: 'printers must be an array' }, { status: 400 })
      }

      // Validate each printer config has required fields
      for (const p of printers) {
        if (typeof p.printNodeId !== 'number') {
          return NextResponse.json({ error: 'Each printer must have a numeric printNodeId' }, { status: 400 })
        }
      }

      // Upsert each printer config into the database
      const results = await savePrinterConfigs(prisma, printers)

      return NextResponse.json({
        success: true,
        saved: results.length,
      })
    }

    if (action === 'delete-station') {
      const { computerName, computerId: bodyComputerId, accessCode } = body
      if (!computerName) {
        return NextResponse.json({ error: 'computerName is required' }, { status: 400 })
      }
      if (accessCode !== '8989') {
        return NextResponse.json({ error: 'Invalid access code' }, { status: 403 })
      }

      // Get computerId: prefer the one sent from frontend, fallback to DB lookup
      let resolvedComputerId: number | null = typeof bodyComputerId === 'number' ? bodyComputerId : null
      if (!resolvedComputerId) {
        const sample = await prisma.printerConfig.findFirst({
          where: { computerName },
          select: { computerId: true },
        })
        resolvedComputerId = sample?.computerId ?? null
      }

      let printNodeResponse: any = null

      // Delete the computer from PrintNode cloud via their API
      if (resolvedComputerId && isPrintNodeConfigured()) {
        try {
          const apiKey = process.env.PRINT_NODE || ''
          const authHeader = 'Basic ' + Buffer.from(apiKey + ':').toString('base64')
          const pnRes = await fetch(`https://api.printnode.com/computers/${resolvedComputerId}`, {
            method: 'DELETE',
            headers: { Authorization: authHeader },
          })
          const pnBody = await pnRes.text()
          printNodeResponse = {
            status: pnRes.status,
            statusText: pnRes.statusText,
            body: pnBody,
          }
          console.log(`[PrintNode] DELETE /computers/${resolvedComputerId} response:`, JSON.stringify(printNodeResponse, null, 2))
        } catch (err: any) {
          printNodeResponse = { error: err.message }
          console.error(`[PrintNode] DELETE /computers/${resolvedComputerId} failed:`, err.message)
        }
      } else {
        console.log(`[PrintNode] No computerId found for "${computerName}" or PrintNode not configured — skipping API delete`)
      }

      // Delete all printer configs for this computer from our DB
      const result = await prisma.printerConfig.deleteMany({
        where: { computerName },
      })

      console.log(`[PrintNode] Deleted station "${computerName}" from local DB (${result.count} printer config(s) removed)`)

      return NextResponse.json({
        success: true,
        deleted: result.count,
        computerName,
        printNodeResponse,
      })
    }

    if (action === 'save-scale-name') {
      const { computerId, deviceName, deviceNum, friendlyName } = body
      if (typeof computerId !== 'number' || !deviceName) {
        return NextResponse.json({ error: 'computerId and deviceName are required' }, { status: 400 })
      }
      const result = await saveScaleFriendlyName(
        prisma,
        computerId,
        deviceName,
        deviceNum ?? 0,
        friendlyName || ''
      )
      return NextResponse.json({ success: true, id: result.id })
    }

    if (action === 'get-weight') {
      const { computerId, deviceName, deviceNum } = body
      if (!computerId || !deviceName) {
        return NextResponse.json({ error: 'computerId and deviceName are required' }, { status: 400 })
      }

      if (!isPrintNodeConfigured()) {
        return NextResponse.json({ error: 'PrintNode not configured' }, { status: 400 })
      }

      const scaleData = await getScaleWeight(computerId, deviceName, deviceNum ?? 0)
      if (!scaleData) {
        return NextResponse.json({
          success: false,
          error: 'No weight reading available. Make sure the scale is connected and has an active reading.',
        }, { status: 404 })
      }

      // Parse the measurement into a human-readable format
      const measurement = scaleData.measurement || {}
      let displayWeight = 'Unknown'
      let unit = ''
      let rawValue = 0

      if (measurement.oz !== undefined) {
        // oz is in billionths
        rawValue = measurement.oz / 1_000_000_000
        unit = 'oz'
        displayWeight = `${rawValue.toFixed(1)}${unit}`
      } else if (measurement.lb !== undefined) {
        rawValue = measurement.lb / 1_000_000_000
        unit = 'lb'
        displayWeight = `${rawValue.toFixed(2)}${unit}`
      } else if (measurement.g !== undefined) {
        rawValue = measurement.g / 1_000_000_000
        unit = 'g'
        displayWeight = `${rawValue.toFixed(1)}${unit}`
      } else if (measurement.kg !== undefined) {
        rawValue = measurement.kg / 1_000_000_000
        unit = 'kg'
        displayWeight = `${rawValue.toFixed(3)}${unit}`
      }

      // Also compute from mass array (micrograms)
      const massUg = scaleData.mass?.[0]
      const massOz = massUg !== null ? (massUg / 28_349_523.125) : null

      console.log(`[PrintNode] Scale "${deviceName}" on computer ${computerId}: ${displayWeight} (mass: ${massUg}µg = ${massOz?.toFixed(1)}oz)`)

      return NextResponse.json({
        success: true,
        weight: displayWeight,
        rawValue,
        unit,
        massUg,
        massOz: massOz !== null ? parseFloat(massOz.toFixed(1)) : null,
        ageOfData: scaleData.ageOfData,
        deviceName: scaleData.deviceName,
        deviceNum: scaleData.deviceNum,
        measurement: scaleData.measurement,
      })
    }

    if (action === 'test-print') {
      const { printerId } = body
      if (!printerId) {
        return NextResponse.json({ error: 'printerId is required' }, { status: 400 })
      }

      if (!isPrintNodeConfigured()) {
        return NextResponse.json({ error: 'PrintNode not configured' }, { status: 400 })
      }

      const testPdfUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
      const jobId = await submitPrintJob(printerId, 'Test Print - E-Com Batch Tool', testPdfUrl)

      return NextResponse.json({ success: true, jobId })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error: any) {
    console.error('[PrintNode API] POST error:', error)
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 })
  }
}
