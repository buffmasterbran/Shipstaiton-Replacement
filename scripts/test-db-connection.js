/**
 * Mini DB connection test: tries DATABASE_URL then POSTGRES_PRISMA_URL.
 * Run: node scripts/test-db-connection.js (from project root)
 * Loads .env.local so it uses the same env as the app.
 */
const path = require('path')
const fs = require('fs')
const { PrismaClient } = require('@prisma/client')

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  const content = fs.readFileSync(envPath, 'utf8')
  content.split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eq = trimmed.indexOf('=')
    if (eq === -1) return
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1)
    process.env[key] = val
  })
}

async function tryConnect(label, url) {
  if (!url) return { label, ok: false, error: 'URL not set' }
  const prisma = new PrismaClient({
    datasources: { db: { url } },
  })
  try {
    await prisma.$connect()
    const count = await prisma.orderLog.count()
    await prisma.$disconnect()
    return { label, ok: true, orderCount: count }
  } catch (err) {
    await prisma.$disconnect().catch(() => {})
    return { label, ok: false, error: err.message }
  }
}

async function main() {
  loadEnvLocal()
  console.log('Mini DB connection test (uses .env.local)\n')
  const results = []
  results.push(await tryConnect('DATABASE_URL', process.env.DATABASE_URL))
  results.push(await tryConnect('POSTGRES_PRISMA_URL', process.env.POSTGRES_PRISMA_URL))
  results.forEach((r) => {
    if (r.ok) {
      console.log(`✅ ${r.label}: connected (${r.orderCount} orders)`)
    } else {
      console.log(`❌ ${r.label}: ${r.error || r.error}`)
    }
  })
  const ok = results.find((r) => r.ok)
  if (ok) {
    console.log(`\n→ Use ${ok.label} so the app can connect.`)
  } else {
    console.log('\n→ Neither URL worked. Check network / Supabase status.')
  }
}

main().catch(console.error)
