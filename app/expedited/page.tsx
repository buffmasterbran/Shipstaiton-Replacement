import { prisma } from '@/lib/prisma'
import RefreshButton from '@/components/RefreshButton'
import ExpeditedOrdersTable from '@/components/ExpeditedOrdersTable'

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

export default async function ExpeditedOrdersPage() {
  const { logs, dbError, errorMessage } = await getOrderLogs()

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expedited Orders</h1>
          <p className="text-sm text-gray-500 mt-1">
            Orders with UPS Next Day, 2 Day, or 3 Day shipping. Also shows orders where the customer has reached out.
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Click "Customer Reached Out" to mark an order as priority - it will be shipped ASAP.
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

      <ExpeditedOrdersTable logs={logs} />
    </div>
  )
}
