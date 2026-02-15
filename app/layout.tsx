import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import './globals.css'

// MainLayout uses usePathname(); load it only on client so navigation context is available (avoids useContext null during SSR)
const MainLayout = dynamic(() => import('@/components/layout/MainLayout'), { ssr: false })

export const metadata: Metadata = {
  title: 'E-Com Batch Tool',
  description: 'View and manage orders from NetSuite',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <MainLayout>{children}</MainLayout>
      </body>
    </html>
  )
}




