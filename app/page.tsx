import { prisma } from '@/lib/prisma'
import RefreshButton from '@/components/RefreshButton'
import OrdersTable from '@/components/OrdersTable'

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getOrderLogs() {
  try {
    const logs = await prisma.orderLog.findMany({
      take: 50,
      orderBy: {
        createdAt: 'desc',
      },
    })
    return logs
  } catch (error) {
    console.error('Error fetching order logs:', error)
    return []
  }
}

export default async function AllOrdersPage() {
  const logs = await getOrderLogs()

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

      <OrdersTable logs={logs} />

      <div className="mt-6 text-sm text-gray-500 text-center">
        Showing {logs.length} most recent order logs
      </div>
    </div>
  )
}
