import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  testUPSConnection,
  generateTestLabel as generateUPSTestLabel,
  validateAddress as validateUPSAddress,
  getUPSRate,
  rateShopUPS,
  clearUPSTokenCache,
  UPS_SERVICES,
  type UPSConnectionConfig,
} from '@/lib/shipping/ups/auth'
import {
  testFedExConnection,
  generateFedExTestLabel,
  validateFedExAddress,
  getFedExRate,
  rateShopFedEx,
  clearFedExTokenCache,
  FEDEX_SERVICES,
  type FedExConnectionConfig,
} from '@/lib/shipping/fedex/auth'
import crypto from 'crypto'

const SETTING_KEY = 'direct_connections'
const SELECTED_SERVICES_KEY = 'selected_services'

type SupportedCarrier = 'ups' | 'fedex'

interface StoredConnection {
  id: string
  nickname: string
  clientId: string
  clientSecret: string
  accountNumber: string
  sandbox: boolean
  status: 'connected' | 'error' | 'untested'
  lastTestedAt?: string
  lastError?: string
  enabledServices?: string[]
}

interface DirectConnections {
  ups?: StoredConnection[]
  fedex?: StoredConnection[]
}

// ─── Carrier-specific adapters ──────────────────────────────────────────────

function toUPSConfig(conn: StoredConnection): UPSConnectionConfig {
  return { clientId: conn.clientId, clientSecret: conn.clientSecret, accountNumber: conn.accountNumber, sandbox: conn.sandbox }
}

function toFedExConfig(conn: StoredConnection): FedExConnectionConfig {
  return { clientId: conn.clientId, clientSecret: conn.clientSecret, accountNumber: conn.accountNumber, sandbox: conn.sandbox }
}

function getServiceCatalog(carrier: SupportedCarrier) {
  return carrier === 'ups' ? UPS_SERVICES : FEDEX_SERVICES
}

function getCarrierCode(carrier: SupportedCarrier) {
  return carrier === 'ups' ? 'ups-direct' : 'fedex-direct'
}

function getCarrierLabel(carrier: SupportedCarrier) {
  return carrier === 'ups' ? 'UPS Direct' : 'FedEx Direct'
}

function clearTokenCache(carrier: SupportedCarrier, clientId: string) {
  if (carrier === 'ups') clearUPSTokenCache(clientId)
  else clearFedExTokenCache(clientId)
}

async function testConnection(carrier: SupportedCarrier, conn: StoredConnection) {
  if (carrier === 'ups') return testUPSConnection(toUPSConfig(conn))
  return testFedExConnection(toFedExConfig(conn))
}

async function generateTestLabel(carrier: SupportedCarrier, conn: StoredConnection) {
  if (carrier === 'ups') return generateUPSTestLabel(toUPSConfig(conn))
  return generateFedExTestLabel(toFedExConfig(conn))
}

async function validateAddr(carrier: SupportedCarrier, conn: StoredConnection, address: any) {
  if (carrier === 'ups') return validateUPSAddress(toUPSConfig(conn), address)
  return validateFedExAddress(toFedExConfig(conn), address)
}

async function getRate(carrier: SupportedCarrier, conn: StoredConnection, serviceCode: string, weight?: string, dims?: any) {
  if (carrier === 'ups') return getUPSRate(toUPSConfig(conn), serviceCode, weight, dims)
  return getFedExRate(toFedExConfig(conn), serviceCode, weight, dims)
}

async function rateShop(carrier: SupportedCarrier, conn: StoredConnection, serviceCodes: string[], weight?: string, dims?: any) {
  if (carrier === 'ups') return rateShopUPS(toUPSConfig(conn), serviceCodes, weight, dims)
  return rateShopFedEx(toFedExConfig(conn), serviceCodes, weight, dims)
}

// ─── Data access ────────────────────────────────────────────────────────────

async function loadConnections(): Promise<DirectConnections> {
  const setting = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } })
  const raw = (setting?.value as DirectConnections) || {}

  // Migrate legacy single-object UPS format to array
  if (raw.ups && !Array.isArray(raw.ups)) {
    const legacy = raw.ups as unknown as Omit<StoredConnection, 'id' | 'nickname'>
    raw.ups = [{ ...legacy, id: crypto.randomUUID(), nickname: 'Default' }]
    await saveConnections(raw)
  }

  return raw
}

async function saveConnections(connections: DirectConnections): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: connections as any },
    update: { value: connections as any },
  })
}

function maskSecret(secret: string): string {
  if (!secret || secret.length <= 4) return '••••••••'
  return secret.slice(0, 4) + '••••••••'
}

function maskConnections(connections: DirectConnections): DirectConnections {
  const masked = { ...connections }
  if (masked.ups) masked.ups = masked.ups.map(c => ({ ...c, clientSecret: maskSecret(c.clientSecret) }))
  if (masked.fedex) masked.fedex = masked.fedex.map(c => ({ ...c, clientSecret: maskSecret(c.clientSecret) }))
  return masked
}

function getCarrierArray(connections: DirectConnections, carrier: SupportedCarrier): StoredConnection[] {
  return connections[carrier] || []
}

function findConnection(connections: DirectConnections, carrier: SupportedCarrier, connectionId: string): StoredConnection | undefined {
  return getCarrierArray(connections, carrier).find(c => c.id === connectionId)
}

function ensureCarrierArray(connections: DirectConnections, carrier: SupportedCarrier): StoredConnection[] {
  if (!connections[carrier]) connections[carrier] = []
  return connections[carrier]!
}

// ─── Selected services sync ─────────────────────────────────────────────────

async function syncSelectedServices(carrier: SupportedCarrier, conn: StoredConnection): Promise<void> {
  const setting = await prisma.appSetting.findUnique({ where: { key: SELECTED_SERVICES_KEY } })
  const current: any[] = (setting?.value as any)?.services || []

  const withoutThis = current.filter((s: any) => s.carrierId !== conn.id)
  const catalog = getServiceCatalog(carrier)
  const carrierCode = getCarrierCode(carrier)
  const carrierLabel = getCarrierLabel(carrier)

  const newEntries = (conn.enabledServices || []).map(code => {
    const svc = catalog.find((s: any) => s.code === code)
    return {
      carrierId: conn.id,
      carrierCode,
      carrierName: `${carrierLabel} - ${conn.nickname}`,
      serviceCode: `${carrierCode}:${code}`,
      serviceName: svc?.name || `${carrierLabel} ${code}`,
      accountNickname: conn.nickname,
      domestic: svc?.domestic ?? true,
      international: svc?.international ?? false,
    }
  })

  const merged = [...withoutThis, ...newEntries]

  await prisma.appSetting.upsert({
    where: { key: SELECTED_SERVICES_KEY },
    create: { key: SELECTED_SERVICES_KEY, value: { services: merged } as any },
    update: { value: { services: merged } as any },
  })
}

async function removeSelectedServices(connectionId: string): Promise<void> {
  const setting = await prisma.appSetting.findUnique({ where: { key: SELECTED_SERVICES_KEY } })
  const current: any[] = (setting?.value as any)?.services || []
  const filtered = current.filter((s: any) => s.carrierId !== connectionId)

  await prisma.appSetting.upsert({
    where: { key: SELECTED_SERVICES_KEY },
    create: { key: SELECTED_SERVICES_KEY, value: { services: filtered } as any },
    update: { value: { services: filtered } as any },
  })
}

// ─── GET ────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const connections = await loadConnections()
    return NextResponse.json({ connections: maskConnections(connections) })
  } catch (err: any) {
    console.error('[Direct Carriers] GET error:', err)
    return NextResponse.json({ error: err.message || 'Failed to load connections' }, { status: 500 })
  }
}

// ─── POST ───────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, carrier, connectionId } = body

    if (carrier !== 'ups' && carrier !== 'fedex') {
      return NextResponse.json({ error: `Unsupported carrier: ${carrier}` }, { status: 400 })
    }

    const carrierKey = carrier as SupportedCarrier

    // --- ADD ---
    if (action === 'add') {
      const { config } = body as {
        config: { nickname: string; clientId: string; clientSecret: string; accountNumber: string; sandbox: boolean }
        action: string; carrier: string
      }
      if (!config?.clientId || !config?.clientSecret || !config?.accountNumber) {
        return NextResponse.json({ error: 'Client ID, Client Secret, and Account Number are required' }, { status: 400 })
      }

      const connections = await loadConnections()
      const arr = ensureCarrierArray(connections, carrierKey)
      const label = carrierKey === 'ups' ? 'UPS' : 'FedEx'

      const newConn: StoredConnection = {
        id: crypto.randomUUID(),
        nickname: config.nickname || `${label} ${arr.length + 1}`,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        accountNumber: config.accountNumber,
        sandbox: config.sandbox ?? false,
        status: 'untested',
        enabledServices: [],
      }

      arr.push(newConn)
      await saveConnections(connections)

      return NextResponse.json({
        success: true,
        connectionId: newConn.id,
        connections: maskConnections(connections),
      })
    }

    // All remaining actions need a connectionId
    if (!connectionId) {
      return NextResponse.json({ error: 'connectionId is required' }, { status: 400 })
    }

    // --- SAVE ---
    if (action === 'save') {
      const { config } = body as {
        config: { nickname?: string; clientId: string; clientSecret: string; accountNumber: string; sandbox: boolean }
        action: string; carrier: string; connectionId: string
      }
      if (!config?.clientId || !config?.clientSecret || !config?.accountNumber) {
        return NextResponse.json({ error: 'Client ID, Client Secret, and Account Number are required' }, { status: 400 })
      }

      const connections = await loadConnections()
      const conn = findConnection(connections, carrierKey, connectionId)
      if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })

      const newSecret = config.clientSecret.includes('••••') ? conn.clientSecret : config.clientSecret

      conn.nickname = config.nickname || conn.nickname
      conn.clientId = config.clientId
      conn.clientSecret = newSecret
      conn.accountNumber = config.accountNumber
      conn.sandbox = config.sandbox ?? false
      conn.status = 'untested'
      conn.lastError = undefined

      clearTokenCache(carrierKey, conn.clientId)
      await saveConnections(connections)

      return NextResponse.json({ success: true, connections: maskConnections(connections) })
    }

    // --- TEST ---
    if (action === 'test') {
      const connections = await loadConnections()
      const conn = findConnection(connections, carrierKey, connectionId)
      if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })

      const result = await testConnection(carrierKey, conn)

      conn.status = result.success ? 'connected' : 'error'
      conn.lastTestedAt = new Date().toISOString()
      conn.lastError = result.success ? undefined : (result.error || result.message)

      await saveConnections(connections)

      return NextResponse.json({ success: result.success, result, connections: maskConnections(connections) })
    }

    // --- TEST-LABEL ---
    if (action === 'test-label') {
      const connections = await loadConnections()
      const conn = findConnection(connections, carrierKey, connectionId)
      if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })

      const result = await generateTestLabel(carrierKey, conn)
      return NextResponse.json({ success: result.success, result })
    }

    // --- VALIDATE-ADDRESS ---
    if (action === 'validate-address') {
      const { address } = body
      if (!address?.street || !address?.city || !address?.state || !address?.postalCode) {
        return NextResponse.json({ error: 'Street, City, State, and Postal Code are required' }, { status: 400 })
      }

      const connections = await loadConnections()
      const conn = findConnection(connections, carrierKey, connectionId)
      if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })

      const result = await validateAddr(carrierKey, conn, address)
      return NextResponse.json({ success: result.success, result })
    }

    // --- GET-RATE ---
    if (action === 'get-rate') {
      const { serviceCode, weight, dims } = body
      if (!serviceCode) return NextResponse.json({ error: 'serviceCode is required' }, { status: 400 })

      const connections = await loadConnections()
      const conn = findConnection(connections, carrierKey, connectionId)
      if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })

      const result = await getRate(carrierKey, conn, serviceCode, weight, dims)
      return NextResponse.json({ success: result.success, result })
    }

    // --- RATE-SHOP ---
    if (action === 'rate-shop') {
      const { serviceCodes, weight, dims } = body

      const connections = await loadConnections()
      const conn = findConnection(connections, carrierKey, connectionId)
      if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })

      const catalog = getServiceCatalog(carrierKey)
      const codes = serviceCodes?.length ? serviceCodes : catalog.filter((s: any) => s.domestic).map((s: any) => s.code)
      const results = await rateShop(carrierKey, conn, codes, weight, dims)
      return NextResponse.json({ success: true, results })
    }

    // --- SAVE-SERVICES ---
    if (action === 'save-services') {
      const { serviceCodes } = body

      const connections = await loadConnections()
      const conn = findConnection(connections, carrierKey, connectionId)
      if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })

      conn.enabledServices = serviceCodes || []
      await saveConnections(connections)
      await syncSelectedServices(carrierKey, conn)

      return NextResponse.json({ success: true, connections: maskConnections(connections) })
    }

    // --- DELETE ---
    if (action === 'delete') {
      const connections = await loadConnections()
      const arr = connections[carrierKey]
      if (arr) {
        const idx = arr.findIndex(c => c.id === connectionId)
        if (idx === -1) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
        const removed = arr[idx]
        clearTokenCache(carrierKey, removed.clientId)
        arr.splice(idx, 1)
        if (arr.length === 0) delete connections[carrierKey]
        await removeSelectedServices(removed.id)
      }

      await saveConnections(connections)
      return NextResponse.json({ success: true, connections: maskConnections(connections) })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err: any) {
    console.error('[Direct Carriers] POST error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
