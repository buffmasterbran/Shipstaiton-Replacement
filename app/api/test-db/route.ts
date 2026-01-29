import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/test-db - Mini connection test using the same Prisma/env as the app.
 * If this works, the app can connect; if it fails, you see the exact error and which URL was used.
 */
export async function GET() {
  const usedUrl =
    process.env.NODE_ENV === 'production'
      ? (process.env.POSTGRES_PRISMA_URL ? 'POSTGRES_PRISMA_URL (pooler)' : 'DATABASE_URL')
      : (process.env.DATABASE_URL ? 'DATABASE_URL' : 'POSTGRES_PRISMA_URL')

  try {
    await prisma.$connect()
    const count = await prisma.orderLog.count()
    await prisma.$disconnect()
    return NextResponse.json({
      ok: true,
      message: 'Connection successful',
      usedEnv: usedUrl,
      orderCount: count,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    const code = error && typeof error === 'object' && 'code' in error ? (error as { code: string }).code : undefined
    return NextResponse.json(
      {
        ok: false,
        message: 'Connection failed',
        usedEnv: usedUrl,
        error: message,
        code: code ?? undefined,
      },
      { status: 500 }
    )
  }
}
