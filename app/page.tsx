import { prisma } from '@/lib/prisma'
import RefreshButton from '@/components/RefreshButton'
import OrdersTable from '@/components/OrdersTable'
import AllOrdersFilters from '@/components/AllOrdersFilters'

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getOrderLogs(dateFrom?: string, dateTo?: string): Promise<{
  logs: Awaited<ReturnType<typeof prisma.orderLog.findMany>>
  dbError: boolean
  errorMessage?: string
}> {
  try {
    const where: { createdAt?: { gte?: Date; lte?: Date } } = {}
    if (dateFrom) {
      const d = new Date(dateFrom)
      d.setHours(0, 0, 0, 0)
      where.createdAt = { ...where.createdAt, gte: d }
    }
    if (dateTo) {
      const d = new Date(dateTo)
      d.setHours(23, 59, 59, 999)
      where.createdAt = { ...where.createdAt, lte: d }
    }

    const logs = await prisma.orderLog.findMany({
      where: Object.keys(where).length ? where : undefined,
      take: 200,
      orderBy: { createdAt: 'desc' },
    })
    return { logs, dbError: false }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error fetching order logs:', error)
    return { logs: [], dbError: true, errorMessage: message }
  }
}

export default async function AllOrdersPage({
  searchParams = {},
}: {
  searchParams?: { from?: string; to?: string }
}) {
  const from = searchParams.from && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.from) ? searchParams.from : undefined
  const to = searchParams.to && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.to) ? searchParams.to : undefined
  const { logs, dbError, errorMessage } = await getOrderLogs(from, to)

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Orders</h1>
          <p className="text-sm text-gray-500 mt-1">
            View incoming orders from NetSuite - Click a row to see details. Late orders are highlighted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AllOrdersFilters from={from} to={to} />
          <RefreshButton />
        </div>
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
        Showing {logs.length} order logs
        {from || to ? ` (filtered by received date${from ? ` from ${from}` : ''}${to ? ` to ${to}` : ''})` : ''}
      </div>
    </div>
  )
}
