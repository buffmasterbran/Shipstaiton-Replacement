import { prisma } from '@/lib/prisma'
import BulkOrdersTable from '@/components/BulkOrdersTable'

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function BulkOrdersPage() {
  let orders: Awaited<ReturnType<typeof prisma.orderLog.findMany>> = []
  let dbError = false
  try {
    orders = await prisma.orderLog.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 1000,
    })
  } catch (error) {
    console.error('Error fetching orders for bulk page:', error)
    dbError = true
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Bulk Orders</h1>
      {dbError && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
          Can&apos;t reach database. Check your network or try again later. Showing empty list.
        </div>
      )}
      <BulkOrdersTable orders={orders} />
    </div>
  )
}

