import { PrismaClient, PrinterConfig as PrismaPrinterConfig, ScaleConfig as PrismaScaleConfig } from '@prisma/client'

// ============================================================================
// Types
// ============================================================================

export interface PrintNodePrinter {
  id: number
  name: string
  description: string
  state: string
  computer: {
    id: number
    name: string
    state: string
  }
}

/** Shape returned to the frontend (live data merged with DB config) */
export interface MergedPrinter extends PrintNodePrinter {
  friendlyName: string
  enabled: boolean
  isDefault: boolean
  computerFriendlyName: string
}

/** Scale data from PrintNode API */
export interface PrintNodeScale {
  mass: [number | null, number | null]
  deviceName: string
  deviceNum: number
  port: string
  count: number | null
  measurement: Record<string, number> // e.g. { g: 779000000000 } or { oz: 10320000000 }
  clientReportedCreateTimestamp: string
  ntpOffset: number | null
  ageOfData: number
  computerId: number
  vendor: string
  product: string
  vendorId: number
  productId: number
}

// ============================================================================
// PrintNode API
// ============================================================================

function getApiKey(): string | null {
  return process.env.PRINT_NODE || null
}

function getAuthHeader(): string {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('PRINT_NODE environment variable not set')
  return 'Basic ' + Buffer.from(apiKey + ':').toString('base64')
}

/**
 * Fetch all printers from PrintNode API
 */
export async function fetchPrintNodePrinters(): Promise<PrintNodePrinter[]> {
  const res = await fetch('https://api.printnode.com/printers', {
    headers: { Authorization: getAuthHeader() },
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('[PrintNode] Failed to fetch printers:', res.status, text)
    throw new Error(`PrintNode API error: ${res.status}`)
  }

  const data = await res.json()
  return data.map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description || '',
    state: p.state || 'unknown',
    computer: {
      id: p.computer?.id || 0,
      name: p.computer?.name || 'Unknown',
      state: p.computer?.state || 'unknown',
    },
  }))
}

/**
 * Fetch all scales for a specific computer from PrintNode API.
 * Scale data is ephemeral — only available for ~45 seconds after a measurement.
 * Returns an empty array if no scales are active.
 */
export async function fetchScalesForComputer(computerId: number): Promise<PrintNodeScale[]> {
  const res = await fetch(`https://api.printnode.com/computer/${computerId}/scales`, {
    headers: { Authorization: getAuthHeader() },
  })

  if (!res.ok) {
    // 404 means no scales found — not an error
    if (res.status === 404) return []
    const text = await res.text()
    console.error(`[PrintNode] Failed to fetch scales for computer ${computerId}:`, res.status, text)
    return []
  }

  const data = await res.json()
  return Array.isArray(data) ? data : []
}

/**
 * Fetch scales for ALL connected computers. Returns a map of computerId -> scales.
 */
export async function fetchAllScales(computerIds: number[]): Promise<Record<number, PrintNodeScale[]>> {
  const results: Record<number, PrintNodeScale[]> = {}
  // Fetch in parallel
  const promises = computerIds.map(async (id) => {
    const scales = await fetchScalesForComputer(id)
    if (scales.length > 0) {
      results[id] = scales
    }
  })
  await Promise.all(promises)
  return results
}

/**
 * Get a single weight reading from a specific scale on a computer.
 * Returns the scale data or null if no reading available.
 */
export async function getScaleWeight(
  computerId: number,
  deviceName: string,
  deviceNum: number = 0
): Promise<PrintNodeScale | null> {
  const encodedName = encodeURIComponent(deviceName)
  const res = await fetch(`https://api.printnode.com/computer/${computerId}/scale/${encodedName}/${deviceNum}`, {
    headers: { Authorization: getAuthHeader() },
  })

  if (!res.ok) {
    if (res.status === 404) return null
    const text = await res.text()
    console.error(`[PrintNode] Failed to get weight for ${deviceName} on computer ${computerId}:`, res.status, text)
    return null
  }

  return await res.json()
}

/**
 * Submit a print job to PrintNode
 */
export async function submitPrintJob(
  printerId: number,
  title: string,
  pdfUrl: string
): Promise<number> {
  const res = await fetch('https://api.printnode.com/printjobs', {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      printerId,
      title,
      contentType: 'pdf_uri',
      content: pdfUrl,
      source: 'E-Com Batch Tool',
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('[PrintNode] Failed to submit print job:', res.status, text)
    throw new Error(`PrintNode print job failed: ${res.status}`)
  }

  // PrintNode returns the job ID as a plain number
  const jobId = await res.json()
  console.log(`[PrintNode] Print job submitted: ${jobId} → printer ${printerId}`)
  return jobId
}

/**
 * Check if PrintNode is configured (API key exists)
 */
export function isPrintNodeConfigured(): boolean {
  return !!getApiKey()
}

// ============================================================================
// Database operations (PrinterConfig table)
// ============================================================================

/**
 * Get all saved printer configurations from the database
 */
export async function getPrinterConfigs(prisma: PrismaClient): Promise<PrismaPrinterConfig[]> {
  return prisma.printerConfig.findMany()
}

/**
 * Get printer configs indexed by printNodeId for quick lookup
 */
export async function getPrinterConfigMap(prisma: PrismaClient): Promise<Map<number, PrismaPrinterConfig>> {
  const configs = await prisma.printerConfig.findMany()
  const map = new Map<number, PrismaPrinterConfig>()
  for (const c of configs) {
    map.set(c.printNodeId, c)
  }
  return map
}

/**
 * Bulk save printer configurations.
 * Upserts each printer by printNodeId and enforces one default per computer.
 */
export async function savePrinterConfigs(
  prisma: PrismaClient,
  configs: Array<{
    printNodeId: number
    name?: string
    friendlyName: string
    computerName: string
    computerFriendlyName?: string
    computerId: number
    enabled: boolean
    isDefault: boolean
  }>
): Promise<PrismaPrinterConfig[]> {
  // Use a transaction for atomicity
  return prisma.$transaction(async (tx) => {
    const results: PrismaPrinterConfig[] = []

    for (const cfg of configs) {
      const result = await tx.printerConfig.upsert({
        where: { printNodeId: cfg.printNodeId },
        update: {
          name: cfg.name ?? '',
          friendlyName: cfg.friendlyName,
          computerName: cfg.computerName,
          computerFriendlyName: cfg.computerFriendlyName ?? '',
          computerId: cfg.computerId,
          enabled: cfg.enabled,
          isDefault: cfg.isDefault,
        },
        create: {
          printNodeId: cfg.printNodeId,
          name: cfg.name ?? '',
          friendlyName: cfg.friendlyName,
          computerName: cfg.computerName,
          computerFriendlyName: cfg.computerFriendlyName ?? '',
          computerId: cfg.computerId,
          enabled: cfg.enabled,
          isDefault: cfg.isDefault,
        },
      })
      results.push(result)
    }

    // Enforce "only one default per computer":
    // For each computer, if multiple printers are marked as default,
    // keep only the first one saved as default and clear the rest.
    const byComputer = new Map<string, PrismaPrinterConfig[]>()
    for (const r of results) {
      const list = byComputer.get(r.computerName) || []
      list.push(r)
      byComputer.set(r.computerName, list)
    }

    byComputer.forEach(async (printers: PrismaPrinterConfig[], computerName: string) => {
      const defaults = printers.filter((p: PrismaPrinterConfig) => p.isDefault)
      if (defaults.length > 1) {
        // Keep the first default, clear the rest
        const keep = defaults[0]
        const clearIds = defaults.slice(1).map((d: PrismaPrinterConfig) => d.id)
        if (clearIds.length > 0) {
          await tx.printerConfig.updateMany({
            where: { id: { in: clearIds } },
            data: { isDefault: false },
          })
        }
        console.log(`[PrintNode] Enforced single default for computer "${computerName}": keeping printer ${keep.printNodeId}`)
      }
    })

    return results
  })
}

/**
 * Set a specific printer as the default for its computer,
 * clearing the previous default for that computer.
 */
export async function setDefaultPrinter(
  prisma: PrismaClient,
  printNodeId: number,
  computerName: string
): Promise<void> {
  await prisma.$transaction([
    // Clear existing default for this computer
    prisma.printerConfig.updateMany({
      where: { computerName, isDefault: true },
      data: { isDefault: false },
    }),
    // Set the new default
    prisma.printerConfig.update({
      where: { printNodeId },
      data: { isDefault: true },
    }),
  ])
}

/**
 * Delete printer configs that no longer exist in PrintNode.
 * Call after fetching live printers to clean up stale records.
 */
export async function cleanupStalePrinterConfigs(
  prisma: PrismaClient,
  livePrintNodeIds: number[]
): Promise<number> {
  const result = await prisma.printerConfig.deleteMany({
    where: {
      printNodeId: { notIn: livePrintNodeIds },
    },
  })
  if (result.count > 0) {
    console.log(`[PrintNode] Cleaned up ${result.count} stale printer config(s)`)
  }
  return result.count
}

/**
 * Merge live PrintNode printers with saved DB configs.
 * New printers (not yet in DB) default to enabled=true, isDefault=false.
 */
export async function getMergedPrinters(
  prisma: PrismaClient
): Promise<MergedPrinter[]> {
  const [livePrinters, configMap] = await Promise.all([
    fetchPrintNodePrinters(),
    getPrinterConfigMap(prisma),
  ])

  return livePrinters.map((p) => {
    const saved = configMap.get(p.id)
    return {
      ...p,
      friendlyName: saved?.friendlyName || '',
      enabled: saved?.enabled ?? true,
      isDefault: saved?.isDefault ?? false,
      computerFriendlyName: saved?.computerFriendlyName || '',
    }
  })
}

// ============================================================================
// Database operations (ScaleConfig table)
// ============================================================================

/**
 * Get all saved scale configs as a map keyed by "computerId-deviceName-deviceNum"
 */
export async function getScaleConfigMap(prisma: PrismaClient): Promise<Map<string, PrismaScaleConfig>> {
  const configs = await prisma.scaleConfig.findMany()
  const map = new Map<string, PrismaScaleConfig>()
  for (const c of configs) {
    const key = `${c.computerId}-${c.deviceName}-${c.deviceNum}`
    map.set(key, c)
  }
  return map
}

/**
 * Save (upsert) a scale friendly name
 */
export async function saveScaleFriendlyName(
  prisma: PrismaClient,
  computerId: number,
  deviceName: string,
  deviceNum: number,
  friendlyName: string
): Promise<PrismaScaleConfig> {
  return prisma.scaleConfig.upsert({
    where: {
      computerId_deviceName_deviceNum: { computerId, deviceName, deviceNum },
    },
    update: { friendlyName },
    create: { computerId, deviceName, deviceNum, friendlyName },
  })
}
