import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import RefreshButton from '@/components/RefreshButton'

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

export default async function Dashboard() {
  const logs = await getOrderLogs()

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            Shipping Log Dashboard
          </h1>
          <RefreshButton />
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-4 text-center text-gray-500"
                    >
                      No order logs found
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {log.orderNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          {log.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <details className="cursor-pointer">
                          <summary className="text-blue-600 hover:text-blue-800 font-medium">
                            View Raw Data
                          </summary>
                          <div className="mt-2 p-4 bg-gray-50 rounded border overflow-x-auto">
                            <pre className="text-xs text-gray-800 whitespace-pre-wrap break-words">
                              {JSON.stringify(log.rawPayload, null, 2)}
                            </pre>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 text-sm text-gray-500 text-center">
          Showing {logs.length} most recent order logs
        </div>
      </div>
    </div>
  )
}


