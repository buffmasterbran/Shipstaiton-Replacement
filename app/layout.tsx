import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Shipping Log Dashboard',
  description: 'View and manage incoming shipping logs from NetSuite',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}


