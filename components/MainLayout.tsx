'use client'

import { useState, useEffect } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import { usePathname } from 'next/navigation'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [canProcess, setCanProcess] = useState(true)
  
  // Check if we're on the singles page to show process button
  const isSinglesPage = pathname === '/singles'
  
  // Listen for process button availability updates
  useEffect(() => {
    const handleProcessButtonAvailability = (event: CustomEvent) => {
      setCanProcess(event.detail.canProcess)
    }
    
    window.addEventListener('processButtonAvailability', handleProcessButtonAvailability as EventListener)
    
    return () => {
      window.removeEventListener('processButtonAvailability', handleProcessButtonAvailability as EventListener)
    }
  }, [])
  
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header 
          showProcessButton={isSinglesPage}
          processButtonText="Process"
          processButtonDisabled={isSinglesPage && !canProcess}
          onProcessClick={isSinglesPage ? () => {
            // This will be handled by the SinglesOrdersTable component
            const event = new CustomEvent('openProcessDialog')
            window.dispatchEvent(event)
          } : undefined}
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}

