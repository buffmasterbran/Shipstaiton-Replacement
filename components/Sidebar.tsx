'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import type { UserRole } from './MainLayout'

interface NavItem {
  name: string
  href: string
  access: 'admin' | 'operator' // who can see this tab
  /** When set, opens in new tab instead of in-app route (until under one roof) */
  externalHref?: string
  icon?: string
}

interface NavSection {
  title: string
  access: 'admin' | 'operator' // minimum access required to see section
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: 'Operations',
    access: 'operator',
    items: [
      { name: 'All Orders', href: '/', access: 'admin' },
      { name: 'Expedited Orders', href: '/expedited', access: 'admin' },
      { name: 'Singles', href: '/singles', access: 'admin' },
      { name: 'Bulk Orders', href: '/bulk', access: 'admin' },
      { name: 'Bulk Verification', href: '/bulk-verification', access: 'operator' },
      { name: 'Orders by Size', href: '/box-size', access: 'admin' },
      { name: 'Personalization', href: '/personalization', access: 'admin', externalHref: 'https://pers-packing-slips.vercel.app/' },
      { name: 'Accessories', href: '/accessories', access: 'admin' },
      { name: 'International Orders', href: '/international', access: 'admin' },
      { name: 'Batches', href: '/batches', access: 'admin' },
    ],
  },
  {
    title: 'Warehouse',
    access: 'operator',
    items: [
      { name: 'Local Pickup Orders', href: '/local-pickup', access: 'operator' },
      { name: 'Receive Returns', href: '/returns', access: 'operator' },
      { name: 'Inventory Count', href: '/inventory-count', access: 'operator', externalHref: 'https://inventory-count.vercel.app/' },
    ],
  },
  {
    title: 'Reports',
    access: 'operator',
    items: [
      { name: 'Analytics', href: '/analytics', access: 'operator', externalHref: 'https://paws-analytics.vercel.app/' },
    ],
  },
  {
    title: 'Configuration',
    access: 'admin',
    items: [
      { name: 'Products', href: '/products', access: 'admin' },
      { name: 'Box Config', href: '/box-config', access: 'admin' },
      { name: 'Settings', href: '/settings', access: 'admin' },
      { name: 'ShipEngine Test', href: '/shipengine-test', access: 'admin' },
    ],
  },
]

export default function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const [expeditedCount, setExpeditedCount] = useState(0)

  // Fetch expedited order count
  useEffect(() => {
    async function fetchExpeditedCount() {
      try {
        const res = await fetch('/api/orders/expedited-count')
        if (res.ok) {
          const data = await res.json()
          setExpeditedCount(data.count || 0)
        }
      } catch (error) {
        console.error('Failed to fetch expedited count:', error)
      }
    }

    fetchExpeditedCount()
    // Refresh every 30 seconds
    const interval = setInterval(fetchExpeditedCount, 30000)
    return () => clearInterval(interval)
  }, [])

  // Filter sections and items based on role
  const visibleSections = navSections
    .map(section => {
      // For operators, only show sections they have access to
      if (role === 'operator' && section.access === 'admin') {
        return null
      }
      // Filter items within the section based on role
      const visibleItems = role === 'operator'
        ? section.items.filter(item => item.access === 'operator')
        : section.items

      if (visibleItems.length === 0) return null

      return { ...section, items: visibleItems }
    })
    .filter((section): section is NavSection => section !== null)

  return (
    <div className="w-64 bg-gray-900 text-white min-h-screen flex flex-col">
      {/* Logo/Title */}
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-xl font-bold">E-Com Batch Tool</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto">
        {visibleSections.map((section, sectionIndex) => (
          <div key={section.title} className={sectionIndex > 0 ? 'mt-6' : ''}>
            {/* Section Header */}
            <h2 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {section.title}
            </h2>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive = !item.externalHref && (pathname === item.href || (item.href === '/' && pathname === '/'))
                const isExpedited = item.href === '/expedited'
                const hasExpeditedOrders = isExpedited && expeditedCount > 0

                // Bright red background when there are expedited orders (unless currently on that page)
                let className = 'block px-4 py-2.5 rounded-lg transition-colors text-sm '
                if (isActive) {
                  className += 'bg-green-600 text-white'
                } else if (hasExpeditedOrders) {
                  className += 'bg-[#ff0000] text-white font-bold hover:bg-red-700'
                } else {
                  className += 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }

                return (
                  <li key={item.externalHref ?? item.href}>
                    {item.externalHref ? (
                      <a
                        href={item.externalHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={className}
                      >
                        {item.name}
                        <span className="ml-1 text-gray-500 text-xs">↗</span>
                      </a>
                    ) : (
                      <Link href={item.href} className={className}>
                        {item.name}
                        {hasExpeditedOrders && (
                          <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold bg-white text-red-600 rounded-full">
                            {expeditedCount}
                          </span>
                        )}
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Logout Button */}
      <div className="p-4 border-t border-gray-800">
        <button className="w-full px-4 py-2 border-2 border-red-600 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-colors">
          Log out
        </button>
      </div>
    </div>
  )
}


