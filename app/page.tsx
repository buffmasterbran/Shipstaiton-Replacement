import { prisma } from '@/lib/prisma'
import { getOrderHighlightSettings } from '@/lib/settings'
import RefreshButton from '@/components/RefreshButton'
import OrdersTable from '@/components/OrdersTable'

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getOrderLogs(): Promise<{
  logs: Awaited<ReturnType<typeof prisma.orderLog.findMany>>
  dbError: boolean
  errorMessage?: string
}> {
  try {
    const logs = await prisma.orderLog.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return { logs, dbError: false }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error fetching order logs:', error)
    return { logs: [], dbError: true, errorMessage: message }
  }
}

export default async function AllOrdersPage() {
  let orderHighlightSettings: Awaited<ReturnType<typeof getOrderHighlightSettings>> | null = null
  try {
    orderHighlightSettings = await getOrderHighlightSettings(prisma)
  } catch {
    // app_settings table may not exist yet; use defaults (null) so OrdersTable still renders
  }
  const { logs, dbError, errorMessage } = await getOrderLogs()

  return (
    <div>
      {/* Compact header bar */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <h1 className="text-xl font-bold text-gray-900 whitespace-nowrap">All Orders</h1>
        <RefreshButton />
      </div>

      {dbError && (
        <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-sm">
          <span className="font-medium">Database error.</span>
          {errorMessage && <span className="ml-2 text-xs font-mono">{errorMessage}</span>}
        </div>
      )}

      <OrdersTable logs={logs} orderHighlightSettings={orderHighlightSettings} />
    </div>
  )
}
