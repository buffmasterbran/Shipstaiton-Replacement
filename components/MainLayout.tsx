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
  const { expeditedOnly, setExpeditedOnly, hidePersonalized, setHidePersonalized } = useExpeditedFilter()
  const { orders, loading: ordersLoading, lastFetchedAt, refreshOrders } = useOrders()
  const [canProcess, setCanProcess] = useState(true)

  const operatorAllowedPaths = ['/bulk-verification', '/local-pickup', '/analytics', '/returns', '/inventory-count']
  useEffect(() => {
    if (role === 'operator' && !operatorAllowedPaths.includes(pathname)) {
      router.replace('/bulk-verification')
    }
  }, [role, pathname, router])

  const isSinglesPage = pathname === '/singles'
  const isExpeditedPage = pathname === '/expedited'

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
          expeditedOnly={expeditedOnly}
          setExpeditedOnly={setExpeditedOnly}
          hideExpeditedToggle={isExpeditedPage}
          hidePersonalized={hidePersonalized}
          setHidePersonalized={setHidePersonalized}
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
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
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

