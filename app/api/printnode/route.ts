import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  fetchPrintNodePrinters,
  submitPrintJob,
  isPrintNodeConfigured,
  getPrinterConfigMap,
  savePrinterConfigs,
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
      }> = {}

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

      return NextResponse.json({ computers })
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
