import { prisma } from '@/lib/prisma'
import BulkOrdersTable from '@/components/BulkOrdersTable'

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function BulkOrdersPage() {
  let orders: Awaited<ReturnType<typeof prisma.orderLog.findMany>> = []
  let queueStatusBySignature: Record<string, 'pending' | 'in_queue' | 'completed'> = {}
  let dbError = false
  try {
    const [ordersResult, queueItems] = await Promise.all([
      prisma.orderLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
      prisma.bulkQueueItem.findMany({
        select: { bulkGroupSignature: true, status: true },
      }),
    ])
    orders = ordersResult

    // Group queue items by signature and derive status
    const bySignature = new Map<string, { pending: number; completed: number }>()
    queueItems.forEach((item) => {
      const cur = bySignature.get(item.bulkGroupSignature) ?? { pending: 0, completed: 0 }
      if (item.status === 'PENDING') cur.pending++
      else if (item.status === 'COMPLETED') cur.completed++
      bySignature.set(item.bulkGroupSignature, cur)
    })
    bySignature.forEach((counts, sig) => {
      if (counts.pending > 0) queueStatusBySignature[sig] = 'in_queue'
      else if (counts.completed > 0) queueStatusBySignature[sig] = 'completed'
    })
    // Signatures not in map stay 'pending' (no queue items)
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
      <BulkOrdersTable orders={orders} queueStatusBySignature={queueStatusBySignature} />
    </div>
  )
}

