'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { RoleProvider, useRole } from '@/context/RoleContext'
import { ExpeditedFilterProvider, useExpeditedFilter } from '@/context/ExpeditedFilterContext'
import { OrdersProvider, useOrders } from '@/context/OrdersContext'
import Sidebar from './Sidebar'
import Header from './Header'

export type { UserRole } from '@/context/RoleContext'

function MainLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { role, setRole } = useRole()
  const { expeditedFilter, setExpeditedFilter, personalizedFilter, setPersonalizedFilter } = useExpeditedFilter()
  const { orders, loading: ordersLoading, lastFetchedAt, refreshOrders, dateStart, dateEnd, setDateStart, setDateEnd } = useOrders()
  const [canProcess, setCanProcess] = useState(true)

  // ---- Session-based permissions ----
  const [isAdmin, setIsAdmin] = useState(false)
  const [allowedPages, setAllowedPages] = useState<string[]>([])
  const [sessionLoaded, setSessionLoaded] = useState(false)

  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch('/api/auth/check')
        if (res.ok) {
          const data = await res.json()
          if (data.authenticated && data.user) {
            setIsAdmin(data.user.isAdmin || false)
            setAllowedPages(data.user.allowedPages || [])
            // Sync RoleContext for backward compat
            setRole(data.user.isAdmin ? 'admin' : 'operator')
          }
        }
      } catch {
        // Session check failed — middleware will handle redirect
      }
      setSessionLoaded(true)
    }
    fetchSession()
  }, [setRole])

  // Legacy operator redirect (now largely handled by middleware, kept as fallback)
  useEffect(() => {
    if (!sessionLoaded) return
    if (isAdmin) return
    // Middleware handles authorization, but as a safety net:
    // if user somehow lands on a page they shouldn't, redirect
  }, [isAdmin, pathname, sessionLoaded])

  const isSinglesPage = pathname === '/singles'
  const isExpeditedPage = pathname === '/expedited'
  const isFullScreenPage = false // scan-to-verify removed
  const isSettingsPage = pathname.startsWith('/settings')

  useEffect(() => {
    const handleProcessButtonAvailability = (event: CustomEvent) => {
      setCanProcess(event.detail.canProcess)
    }
    window.addEventListener('processButtonAvailability', handleProcessButtonAvailability as EventListener)
    return () => {
      window.removeEventListener('processButtonAvailability', handleProcessButtonAvailability as EventListener)
    }
  }, [])

  // Show minimal loading state until session is resolved
  if (!sessionLoaded) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <div className="w-64 bg-gray-900" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-400 text-sm">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar isAdmin={isAdmin} allowedPages={allowedPages} />
      <div className="flex-1 flex flex-col">
        {!isFullScreenPage && !isSettingsPage && (
          <Header
            role={role}
            setRole={setRole}
            expeditedFilter={expeditedFilter}
            setExpeditedFilter={setExpeditedFilter}
            hideExpeditedToggle={isExpeditedPage}
            personalizedFilter={personalizedFilter}
            setPersonalizedFilter={setPersonalizedFilter}
            showProcessButton={isSinglesPage}
            processButtonText="Process"
            processButtonDisabled={isSinglesPage && !canProcess}
            onProcessClick={isSinglesPage ? () => {
              const event = new CustomEvent('openProcessDialog')
              window.dispatchEvent(event)
            } : undefined}
            ordersCount={orders.length}
            ordersLoading={ordersLoading}
            lastFetchedAt={lastFetchedAt}
            onRefreshOrders={refreshOrders}
            dateStart={dateStart}
            dateEnd={dateEnd}
            setDateStart={setDateStart}
            setDateEnd={setDateEnd}
          />
        )}
        <main className={isFullScreenPage ? 'flex-1 flex flex-col' : 'flex-1 p-6'}>{children}</main>
      </div>
    </div>
  )
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Login page renders without any app chrome (sidebar, header, providers)
  if (pathname === '/login') {
    return <>{children}</>
  }

  return (
    <RoleProvider>
      <ExpeditedFilterProvider>
        <OrdersProvider>
          <MainLayoutContent>{children}</MainLayoutContent>
        </OrdersProvider>
      </ExpeditedFilterProvider>
    </RoleProvider>
  )
}
