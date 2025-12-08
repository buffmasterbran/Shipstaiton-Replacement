import type { Metadata } from 'next'
import './globals.css'
import MainLayout from '@/components/MainLayout'

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




