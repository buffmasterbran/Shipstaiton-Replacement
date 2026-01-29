import { prisma } from '@/lib/prisma'
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
      take: 50,
      orderBy: {
        createdAt: 'desc',
      },
    })
    return { logs, dbError: false }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error fetching order logs:', error)
    return { logs: [], dbError: true, errorMessage: message }
  }
}

export default async function AllOrdersPage() {
  const { logs, dbError, errorMessage } = await getOrderLogs()

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Orders</h1>
          <p className="text-sm text-gray-500 mt-1">
            View incoming orders from NetSuite - Click a row to see details
          </p>
        </div>
        <RefreshButton />
      </div>

      {dbError && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
          <p className="font-medium">Can&apos;t reach database. Showing empty list.</p>
          {errorMessage && (
            <p className="mt-2 text-xs font-mono break-all">{errorMessage}</p>
          )}
        </div>
      )}

      <OrdersTable logs={logs} />

      <div className="mt-6 text-sm text-gray-500 text-center">
        Showing {logs.length} most recent order logs
      </div>
    </div>
  )
}
