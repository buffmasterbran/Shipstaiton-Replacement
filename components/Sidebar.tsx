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
      { name: 'Error Orders', href: '/errors', access: 'admin' },
      { name: 'Orders on Hold', href: '/hold', access: 'admin' },
      { name: 'Singles', href: '/singles', access: 'admin' },
      { name: 'Bulk Orders', href: '/bulk', access: 'admin' },
      { name: 'Bulk Verification', href: '/bulk-verification', access: 'operator' },
      { name: 'Orders by Size', href: '/box-size', access: 'admin' },
      { name: 'Personalization', href: '/personalization', access: 'admin', externalHref: 'https://pers-packing-slips.vercel.app/' },
      { name: 'International Orders', href: '/international', access: 'admin' },
      { name: 'Batches', href: '/batches', access: 'admin' },
    ],
  },
  {
    title: 'Warehouse',
    access: 'operator',
    items: [
      { name: 'Scan to Verify', href: '/scan-to-verify', access: 'operator' },
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
      { name: 'Carriers', href: '/carriers', access: 'admin' },
      { name: 'Locations', href: '/locations', access: 'admin' },
      { name: 'Rate Shopping', href: '/rate-shopping', access: 'admin' },
      { name: 'Settings', href: '/settings', access: 'admin' },
      { name: 'ShipEngine Test', href: '/shipengine-test', access: 'admin' },
    ],
  },
]

export default function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const [expeditedCount, setExpeditedCount] = useState(0)
  const [errorCount, setErrorCount] = useState(0)
  const [holdCount, setHoldCount] = useState(0)
  const [pinnedItems, setPinnedItems] = useState<string[]>([])

  // Default pinned items
  const defaultPinnedItems = ['/', '/singles', '/bulk', '/box-size']

  // Load pinned items from localStorage
  useEffect(() => {
    const savedPinned = localStorage.getItem('sidebar-pinned-items')
    if (savedPinned) {
      try {
        setPinnedItems(JSON.parse(savedPinned))
      } catch {
        setPinnedItems(defaultPinnedItems)
      }
    } else {
      // Set defaults if nothing saved
      setPinnedItems(defaultPinnedItems)
    }
  }, [])

  // Toggle pin for an item
  const togglePin = (href: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const newPinned = pinnedItems.includes(href)
      ? pinnedItems.filter(h => h !== href)
      : [...pinnedItems, href]
    setPinnedItems(newPinned)
    localStorage.setItem('sidebar-pinned-items', JSON.stringify(newPinned))
  }

  // Fetch expedited, error, and hold order counts
  useEffect(() => {
    async function fetchCounts() {
      try {
        const [expeditedRes, errorRes, holdRes] = await Promise.all([
          fetch('/api/orders/expedited-count'),
          fetch('/api/orders/error-count'),
          fetch('/api/orders/hold-count'),
        ])
        if (expeditedRes.ok) {
          const data = await expeditedRes.json()
          setExpeditedCount(data.count || 0)
        }
        if (errorRes.ok) {
          const data = await errorRes.json()
          setErrorCount(data.count || 0)
        }
        if (holdRes.ok) {
          const data = await holdRes.json()
          setHoldCount(data.count || 0)
        }
      } catch (error) {
        console.error('Failed to fetch counts:', error)
      }
    }

    fetchCounts()
    // Refresh every 30 seconds
    const interval = setInterval(fetchCounts, 30000)
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
    <div className="w-64 bg-gray-900 text-white h-screen flex flex-col">
      {/* Logo/Title - fixed at top */}
      <div className="p-6 border-b border-gray-800 flex-shrink-0">
        <h1 className="text-xl font-bold">E-Com Batch Tool</h1>
      </div>

      {/* Navigation - scrollable independently */}
      <nav className="flex-1 p-4 overflow-y-auto min-h-0">
        {/* Pinned Items Section */}
        {pinnedItems.length > 0 && (
          <div className="mb-4 pb-4 border-b border-gray-700">
            <h2 className="px-4 py-2 text-xs font-semibold text-yellow-500 uppercase tracking-wider flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C9.5 2 7.5 4 7.5 6.5c0 1.5.7 2.8 1.8 3.7L12 22l2.7-11.8c1.1-.9 1.8-2.2 1.8-3.7C16.5 4 14.5 2 12 2zm0 7a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
              </svg>
              Pinned
            </h2>
            <ul className="space-y-1">
              {pinnedItems.map((href) => {
                // Find the item in all sections
                const item = visibleSections
                  .flatMap(s => s.items)
                  .find(i => i.href === href || i.externalHref === href)
                if (!item) return null

                const isActive = !item.externalHref && (pathname === item.href || (item.href === '/' && pathname === '/'))
                const isExpedited = item.href === '/expedited'
                const isErrors = item.href === '/errors'
                const isHold = item.href === '/hold'
                const hasExpeditedOrders = isExpedited && expeditedCount > 0
                const hasErrorOrders = isErrors && errorCount > 0
                const hasHoldOrders = isHold && holdCount > 0

                let className = 'flex items-center justify-between px-4 py-2.5 rounded-lg transition-colors text-sm group '
                if (isActive) {
                  className += 'bg-green-600 text-white'
                } else if (hasExpeditedOrders) {
                  className += 'bg-[#ff0000] text-white font-bold hover:bg-red-700'
                } else if (hasErrorOrders) {
                  className += 'bg-orange-600 text-white font-bold hover:bg-orange-700'
                } else if (hasHoldOrders) {
                  className += 'bg-yellow-600 text-white font-bold hover:bg-yellow-700'
                } else {
                  className += 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }

                return (
                  <li key={`pinned-${href}`}>
                    {item.externalHref ? (
                      <div className={className}>
                        <a
                          href={item.externalHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1"
                        >
                          {item.name}
                          <span className="ml-1 text-gray-500 text-xs">↗</span>
                        </a>
                        <button
                          onClick={(e) => togglePin(item.externalHref!, e)}
                          className="p-1 opacity-0 group-hover:opacity-100 hover:text-yellow-400 transition-opacity"
                          title="Unpin"
                        >
                          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                            <path d="M12 2C9.5 2 7.5 4 7.5 6.5c0 1.5.7 2.8 1.8 3.7L12 22l2.7-11.8c1.1-.9 1.8-2.2 1.8-3.7C16.5 4 14.5 2 12 2zm0 7a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className={className}>
                        <Link href={item.href} className="flex-1">
                          {item.name}
                          {hasExpeditedOrders && (
                            <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold bg-white text-red-600 rounded-full">
                              {expeditedCount}
                            </span>
                          )}
                          {hasErrorOrders && (
                            <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold bg-white text-orange-600 rounded-full">
                              {errorCount}
                            </span>
                          )}
                          {hasHoldOrders && (
                            <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold bg-white text-yellow-600 rounded-full">
                              {holdCount}
                            </span>
                          )}
                        </Link>
                        <button
                          onClick={(e) => togglePin(item.href, e)}
                          className="p-1 opacity-0 group-hover:opacity-100 hover:text-yellow-400 transition-opacity"
                          title="Unpin"
                        >
                          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                            <path d="M12 2C9.5 2 7.5 4 7.5 6.5c0 1.5.7 2.8 1.8 3.7L12 22l2.7-11.8c1.1-.9 1.8-2.2 1.8-3.7C16.5 4 14.5 2 12 2zm0 7a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Regular Sections */}
        {visibleSections.map((section, sectionIndex) => (
          <div key={section.title} className={sectionIndex > 0 || pinnedItems.length > 0 ? 'mt-4' : ''}>
            {/* Section Header */}
            <h2 className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {section.title}
            </h2>
            
            {/* Items list */}
            <ul className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = !item.externalHref && (pathname === item.href || (item.href === '/' && pathname === '/'))
                    const isExpedited = item.href === '/expedited'
                    const isErrors = item.href === '/errors'
                    const isHold = item.href === '/hold'
                    const hasExpeditedOrders = isExpedited && expeditedCount > 0
                    const hasErrorOrders = isErrors && errorCount > 0
                    const hasHoldOrders = isHold && holdCount > 0
                    const isPinned = pinnedItems.includes(item.externalHref || item.href)

                    let className = 'flex items-center justify-between px-4 py-2.5 rounded-lg transition-colors text-sm group '
                    if (isActive) {
                      className += 'bg-green-600 text-white'
                    } else if (hasExpeditedOrders) {
                      className += 'bg-[#ff0000] text-white font-bold hover:bg-red-700'
                    } else if (hasErrorOrders) {
                      className += 'bg-orange-600 text-white font-bold hover:bg-orange-700'
                    } else if (hasHoldOrders) {
                      className += 'bg-yellow-600 text-white font-bold hover:bg-yellow-700'
                    } else {
                      className += 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }

                    return (
                      <li key={item.externalHref ?? item.href}>
                        {item.externalHref ? (
                          <div className={className}>
                            <a
                              href={item.externalHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1"
                            >
                              {item.name}
                              <span className="ml-1 text-gray-500 text-xs">↗</span>
                            </a>
                            <button
                              onClick={(e) => togglePin(item.externalHref!, e)}
                              className={`p-1 transition-opacity ${isPinned ? 'text-yellow-400' : 'opacity-0 group-hover:opacity-100 hover:text-yellow-400'}`}
                              title={isPinned ? 'Unpin' : 'Pin to top'}
                            >
                              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                <path d="M12 2C9.5 2 7.5 4 7.5 6.5c0 1.5.7 2.8 1.8 3.7L12 22l2.7-11.8c1.1-.9 1.8-2.2 1.8-3.7C16.5 4 14.5 2 12 2zm0 7a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <div className={className}>
                            <Link href={item.href} className="flex-1">
                              {item.name}
                              {hasExpeditedOrders && (
                                <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold bg-white text-red-600 rounded-full">
                                  {expeditedCount}
                                </span>
                              )}
                              {hasErrorOrders && (
                                <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold bg-white text-orange-600 rounded-full">
                                  {errorCount}
                                </span>
                              )}
                              {hasHoldOrders && (
                                <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold bg-white text-yellow-600 rounded-full">
                                  {holdCount}
                                </span>
                              )}
                            </Link>
                            <button
                              onClick={(e) => togglePin(item.href, e)}
                              className={`p-1 transition-opacity ${isPinned ? 'text-yellow-400' : 'opacity-0 group-hover:opacity-100 hover:text-yellow-400'}`}
                              title={isPinned ? 'Unpin' : 'Pin to top'}
                            >
                              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                <path d="M12 2C9.5 2 7.5 4 7.5 6.5c0 1.5.7 2.8 1.8 3.7L12 22l2.7-11.8c1.1-.9 1.8-2.2 1.8-3.7C16.5 4 14.5 2 12 2zm0 7a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
      </nav>

      {/* Logout Button - fixed at bottom */}
      <div className="p-4 border-t border-gray-800 flex-shrink-0">
        <button className="w-full px-4 py-2 border-2 border-red-600 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-colors">
          Log out
        </button>
      </div>
    </div>
  )
}


