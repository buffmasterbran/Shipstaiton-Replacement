import { prisma } from '@/lib/prisma'
import SinglesOrdersTable from '@/components/SinglesOrdersTable'
import { isSingleItemOrder } from '@/lib/order-utils'

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getSingleItemOrders() {
  try {
    const logs = await prisma.orderLog.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    })
    
    // Filter to only single-item orders
    const singleItemOrders = logs.filter((log) => {
      const payload = log.rawPayload as any
      const order = Array.isArray(payload) ? payload[0] : payload
      const items = order?.items || []
      return isSingleItemOrder(items)
    })
    
    return singleItemOrders
  } catch (error) {
    console.error('Error fetching single item orders:', error)
    return []
  }
}

export default async function SinglesOrdersPage() {
  const orders = await getSingleItemOrders()

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Singles Orders</h1>
      <SinglesOrdersTable orders={orders} />
    </div>
  )
}
