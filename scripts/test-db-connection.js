const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function testConnection() {
  try {
    console.log('🔌 Testing database connection...\n')
    
    // Test connection
    await prisma.$connect()
    console.log('✅ Successfully connected to database!\n')
    
    // Count orders
    const orderCount = await prisma.orderLog.count()
    console.log(`📊 Total orders in database: ${orderCount}\n`)
    
    // Get a few sample orders
    if (orderCount > 0) {
      const sampleOrders = await prisma.orderLog.findMany({
        take: 5,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          createdAt: true,
        },
      })
      
      console.log('📦 Sample orders:')
      sampleOrders.forEach((order, idx) => {
        console.log(`  ${idx + 1}. Order #${order.orderNumber} - Status: ${order.status} - Created: ${order.createdAt}`)
      })
    } else {
      console.log('⚠️  No orders found in database.')
    }
    
  } catch (error) {
    console.error('❌ Error connecting to database:', error.message)
    if (error.code === 'P1001') {
      console.error('\n💡 This usually means the database is unreachable. Check:')
      console.error('   - Is the DATABASE_URL correct?')
      console.error('   - Is the database server running?')
      console.error('   - Are firewall rules blocking the connection?')
    }
  } finally {
    await prisma.$disconnect()
  }
}

testConnection()

