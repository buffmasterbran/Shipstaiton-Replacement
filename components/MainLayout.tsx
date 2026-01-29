'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { RoleProvider, useRole } from '@/context/RoleContext'
import Sidebar from './Sidebar'
import Header from './Header'

export type { UserRole } from '@/context/RoleContext'

function MainLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { role, setRole } = useRole()
  const [canProcess, setCanProcess] = useState(true)

  useEffect(() => {
    if (role === 'operator' && pathname !== '/bulk-verification') {
      router.replace('/bulk-verification')
    }
  }, [role, pathname, router])

  const isSinglesPage = pathname === '/singles'

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
      <Sidebar role={role} />
      <div className="flex-1 flex flex-col">
        <Header
          role={role}
          setRole={setRole}
          showProcessButton={isSinglesPage}
          processButtonText="Process"
          processButtonDisabled={isSinglesPage && !canProcess}
          onProcessClick={isSinglesPage ? () => {
            const event = new CustomEvent('openProcessDialog')
            window.dispatchEvent(event)
          } : undefined}
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleProvider>
      <MainLayoutContent>{children}</MainLayoutContent>
    </RoleProvider>
  )
}

