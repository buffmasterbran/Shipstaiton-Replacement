import { prisma } from '@/lib/prisma'
import RefreshButton from '@/components/RefreshButton'

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

// Helper function to format address
function formatAddress(address: any) {
  if (!address) return 'N/A'
  const parts = [
    address.street1,
    address.street2,
    `${address.city}, ${address.state} ${address.postalCode}`,
    address.country,
  ].filter(Boolean)
  return parts.join('\n')
}

// Helper function to format currency
function formatCurrency(amount: number | string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(amount))
}

export default async function Dashboard() {
  const logs = await getOrderLogs()

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Shipping Log Dashboard
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              View incoming orders from NetSuite
            </p>
          </div>
          <RefreshButton />
        </div>

        {logs.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500 text-lg">No order logs found</p>
            <p className="text-gray-400 text-sm mt-2">
              Orders will appear here once they're sent from NetSuite
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {logs.map((log) => {
              const order = Array.isArray(log.rawPayload)
                ? log.rawPayload[0]
                : log.rawPayload

              return (
                <div
                  key={log.id}
                  className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
                >
                  {/* Order Header */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <h2 className="text-xl font-bold text-gray-900">
                            Order #{order?.orderNumber || log.orderNumber}
                          </h2>
                          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            {log.status}
                          </span>
                        </div>
                        <div className="mt-2 text-sm text-gray-600">
                          <span className="font-medium">Received:</span>{' '}
                          {new Date(log.createdAt).toLocaleString()}
                          {order?.orderDate && (
                            <>
                              {' • '}
                              <span className="font-medium">Order Date:</span>{' '}
                              {new Date(order.orderDate).toLocaleDateString()}
                            </>
                          )}
                        </div>
                      </div>
                      {order?.orderKey && (
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">NetSuite ID:</span>{' '}
                          {order.orderKey}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Order Details Grid */}
                  <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Shipping Address */}
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                          Shipping Address
                        </h3>
                        {order?.shipTo ? (
                          <div className="text-sm text-gray-900 whitespace-pre-line">
                            <div className="font-medium">{order.shipTo.name}</div>
                            {order.shipTo.company && (
                              <div className="text-gray-600">
                                {order.shipTo.company}
                              </div>
                            )}
                            <div className="mt-2">
                              {formatAddress(order.shipTo)}
                            </div>
                            {order.shipTo.phone && (
                              <div className="mt-2 text-gray-600">
                                📞 {order.shipTo.phone}
                              </div>
                            )}
                            {order.shipTo.residential !== undefined && (
                              <div className="mt-2 text-xs text-gray-500">
                                {order.shipTo.residential
                                  ? 'Residential'
                                  : 'Commercial'}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-gray-400 text-sm">No shipping address</p>
                        )}
                      </div>

                      {/* Billing Address */}
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                          Billing Address
                        </h3>
                        {order?.billTo ? (
                          <div className="text-sm text-gray-900 whitespace-pre-line">
                            <div className="font-medium">{order.billTo.name}</div>
                            <div className="mt-2">
                              {formatAddress(order.billTo)}
                            </div>
                            {order.billTo.phone && (
                              <div className="mt-2 text-gray-600">
                                📞 {order.billTo.phone}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-gray-400 text-sm">No billing address</p>
                        )}
                      </div>
                    </div>

                    {/* Items Table */}
                    {order?.items && order.items.length > 0 && (
                      <div className="mt-6">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                          Order Items ({order.items.length})
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  SKU
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Item
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Qty
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Price
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Weight
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {order.items.map((item: any, idx: number) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900">
                                    {item.sku || 'N/A'}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-900">
                                    <div className="font-medium">{item.name || 'Unnamed Item'}</div>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                                    {item.quantity || 0}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                                    {item.unitPrice
                                      ? formatCurrency(item.unitPrice)
                                      : '$0.00'}
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-right">
                                    {item.weight?.value
                                      ? `${item.weight.value} ${item.weight.units || 'lbs'}`
                                      : 'N/A'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Order Summary */}
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {order?.amountPaid !== undefined && (
                        <div className="bg-blue-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                            Amount Paid
                          </div>
                          <div className="mt-1 text-lg font-bold text-blue-900">
                            {formatCurrency(order.amountPaid)}
                          </div>
                        </div>
                      )}
                      {order?.shippingAmount !== undefined && (
                        <div className="bg-green-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                            Shipping Cost
                          </div>
                          <div className="mt-1 text-lg font-bold text-green-900">
                            {formatCurrency(order.shippingAmount)}
                          </div>
                        </div>
                      )}
                      {order?.taxAmount !== undefined && order.taxAmount > 0 && (
                        <div className="bg-yellow-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                            Tax
                          </div>
                          <div className="mt-1 text-lg font-bold text-yellow-900">
                            {formatCurrency(order.taxAmount)}
                          </div>
                        </div>
                      )}
                      {order?.weight && (
                        <div className="bg-purple-50 rounded-lg p-4">
                          <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                            Total Weight
                          </div>
                          <div className="mt-1 text-lg font-bold text-purple-900">
                            {order.weight.value} {order.weight.units || 'lbs'}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Additional Info */}
                    <div className="mt-6 flex flex-wrap gap-4 text-sm">
                      {order?.requestedShippingService && (
                        <div className="bg-gray-100 rounded px-3 py-2">
                          <span className="font-medium text-gray-700">Shipping Method:</span>{' '}
                          <span className="text-gray-900">
                            {order.requestedShippingService}
                          </span>
                        </div>
                      )}
                      {order?.paymentMethod && (
                        <div className="bg-gray-100 rounded px-3 py-2">
                          <span className="font-medium text-gray-700">Payment:</span>{' '}
                          <span className="text-gray-900">{order.paymentMethod}</span>
                        </div>
                      )}
                      {order?.orderStatus && (
                        <div className="bg-gray-100 rounded px-3 py-2">
                          <span className="font-medium text-gray-700">Status:</span>{' '}
                          <span className="text-gray-900">{order.orderStatus}</span>
                        </div>
                      )}
                      {order?.advancedOptions?.customField1 && (
                        <div className="bg-gray-100 rounded px-3 py-2">
                          <span className="font-medium text-gray-700">Notes:</span>{' '}
                          <span className="text-gray-900">
                            {order.advancedOptions.customField1}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Raw Data Toggle */}
                    <details className="mt-6">
                      <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-800">
                        View Raw JSON Data
                      </summary>
                      <div className="mt-3 p-4 bg-gray-50 rounded border overflow-x-auto">
                        <pre className="text-xs text-gray-800 whitespace-pre-wrap break-words">
                          {JSON.stringify(log.rawPayload, null, 2)}
                        </pre>
                      </div>
                    </details>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-6 text-sm text-gray-500 text-center">
          Showing {logs.length} most recent order logs
        </div>
      </div>
    </div>
  )
}
