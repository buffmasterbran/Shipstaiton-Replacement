import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Production (Vercel): use pooler (POSTGRES_PRISMA_URL) when set by Supabase so serverless connects.
// Development: use DATABASE_URL then pooler from .env.local so either direct or pooler can work.
const databaseUrl =
  process.env.NODE_ENV === 'production'
    ? (process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL)
    : (process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL)

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(databaseUrl && { datasources: { db: { url: databaseUrl } } }),
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['query', 'error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma





