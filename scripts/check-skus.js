const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkSKUs() {
  try {
    const logs = await prisma.orderLog.findMany({
      take: 10,
      orderBy: {
        createdAt: 'desc',
      },
    })
    
    console.log('Sample SKUs and Names:\n')
    logs.forEach((log, idx) => {
      const payload = log.rawPayload
      const order = Array.isArray(payload) ? payload[0] : payload
      if (order?.items) {
        console.log(`Order ${log.orderNumber}:`)
        order.items.forEach((item) => {
          console.log(`  SKU: ${item.sku || 'N/A'} | Name: ${item.name || 'N/A'}`)
        })
        console.log('')
      }
    })
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkSKUs()


