import { prisma } from '@/lib/prisma'
import BulkOrdersTable from '@/components/BulkOrdersTable'

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function BulkOrdersPage() {
  const orders = await prisma.orderLog.findMany({
    orderBy: {
      createdAt: 'desc',
    },
    take: 1000, // Adjust as needed
  })

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Bulk Orders</h1>
      <BulkOrdersTable orders={orders} />
    </div>
  )
}

