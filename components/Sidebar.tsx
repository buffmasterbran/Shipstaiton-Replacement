'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'

// ============================================================================
// Path-to-page-key mapping (mirrors lib/permissions.ts for client use)
// ============================================================================

const PATH_TO_KEY: Record<string, string> = {
  '/': 'all-orders',
  '/dashboard': 'dashboard',
  '/expedited': 'expedited',
  '/errors': 'errors',
  '/hold': 'hold',
  '/singles': 'singles',
  '/bulk': 'bulk',
  '/box-size': 'box-size',
  '/personalized-orders': 'personalized-orders',
  '/international': 'international',
  '/batch-queue': 'batch-queue',
  '/pick': 'pick',
  '/personalization': 'personalization',
  '/cart-scan': 'cart-scan',
  '/local-pickup': 'local-pickup',
  '/returns': 'returns',
  '/inventory-count': 'inventory-count',
  '/analytics': 'analytics',
}

// ============================================================================
// Nav definitions
// ============================================================================

interface NavItem {
  name: string
  href: string
  externalHref?: string
  icon?: string
}

interface NavSection {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: 'Operations',
    items: [
      { name: 'Dashboard', href: '/dashboard' },
      { name: 'All Orders', href: '/' },
      { name: 'Expedited Orders', href: '/expedited' },
      { name: 'Error Orders', href: '/errors' },
      { name: 'Orders on Hold', href: '/hold' },
      { name: 'Singles', href: '/singles' },
      { name: 'Bulk Orders', href: '/bulk' },
      { name: 'Orders by Size', href: '/box-size' },
      { name: 'Personalized Orders', href: '/personalized-orders' },
      { name: 'International Orders', href: '/international' },
      { name: 'Batch Queue', href: '/batch-queue' },
    ],
  },
  {
    title: 'Warehouse',
    items: [
      { name: 'Picker', href: '/pick' },
      { name: 'Engraving Station', href: '/personalization' },
      { name: 'Cart Scan', href: '/cart-scan' },
      { name: 'Local Pickup Orders', href: '/local-pickup' },
      { name: 'Receive Returns', href: '/returns' },
      { name: 'Inventory Count', href: '/inventory-count', externalHref: 'https://inventory-count.vercel.app/' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { name: 'Analytics', href: '/analytics', externalHref: 'https://paws-analytics.vercel.app/' },
    ],
  },
]

// Account page is visible to ALL users; the rest are admin-only
const settingsNavItems = [
  { name: 'My Account', href: '/settings/account', adminOnly: false },
  { name: 'General', href: '/settings', adminOnly: true },
  { name: 'Printers', href: '/settings/printers', adminOnly: true },
  { name: 'Carts & Cells', href: '/settings/carts-cells', adminOnly: true },
  { name: 'Carriers', href: '/settings/carriers', adminOnly: true },
  { name: 'Locations', href: '/settings/locations', adminOnly: true },
  { name: 'Box Config', href: '/settings/box-config', adminOnly: true },
  { name: 'Shipping Rules', href: '/settings/rate-shopping', adminOnly: true },
  { name: 'Products', href: '/settings/products', adminOnly: true },
  { name: 'Users & Permissions', href: '/settings/users', adminOnly: true },
  { name: 'Developer', href: '/settings/developer', adminOnly: true },
  { name: 'NetSuite Test', href: '/settings/netsuite-test', adminOnly: true },
]

// ============================================================================
// Sidebar Props
// ============================================================================

interface SidebarProps {
  isAdmin: boolean
  allowedPages: string[]
}

export default function Sidebar({ isAdmin, allowedPages }: SidebarProps) {
  const pathname = usePathname()
  const isSettingsMode = pathname.startsWith('/settings')
  const [loggingOut, setLoggingOut] = useState(false)
  const [expeditedCount, setExpeditedCount] = useState(0)
  const [errorCount, setErrorCount] = useState(0)
  const [holdCount, setHoldCount] = useState(0)
  const [pinnedItems, setPinnedItems] = useState<string[]>([])

  // Admin "Preview as group" state
  const [previewGroupId, setPreviewGroupId] = useState<string | null>(null)
  const [previewPages, setPreviewPages] = useState<string[] | null>(null)
  const [groups, setGroups] = useState<Array<{ id: string; name: string; pageKeys: string[] }>>([])
  const [groupsLoaded, setGroupsLoaded] = useState(false)

  // No default pins — users pin their own
  const defaultPinnedItems: string[] = []

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Even if the API call fails, redirect to login
    }
    window.location.href = '/login'
  }

  // Load pinned items from localStorage
  useEffect(() => {
    if (isSettingsMode) return
    const savedPinned = localStorage.getItem('sidebar-pinned-items')
    if (savedPinned) {
      try {
        setPinnedItems(JSON.parse(savedPinned))
      } catch {
        setPinnedItems(defaultPinnedItems)
      }
    } else {
      setPinnedItems(defaultPinnedItems)
    }
  }, [isSettingsMode])

  const togglePin = (href: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const newPinned = pinnedItems.includes(href)
      ? pinnedItems.filter(h => h !== href)
      : [...pinnedItems, href]
    setPinnedItems(newPinned)
    localStorage.setItem('sidebar-pinned-items', JSON.stringify(newPinned))
  }

  // Fetch permission groups for admin preview (once)
  useEffect(() => {
    if (!isAdmin || isSettingsMode || groupsLoaded) return
    async function fetchGroups() {
      try {
        const res = await fetch('/api/permission-groups')
        if (res.ok) {
          const data = await res.json()
          setGroups(data.groups || [])
        }
      } catch {
        // non-critical
      }
      setGroupsLoaded(true)
    }
    fetchGroups()
  }, [isAdmin, isSettingsMode, groupsLoaded])

  const handlePreviewChange = (groupId: string) => {
    if (groupId === '') {
      setPreviewGroupId(null)
      setPreviewPages(null)
      return
    }
    const group = groups.find(g => g.id === groupId)
    if (group) {
      setPreviewGroupId(group.id)
      setPreviewPages(group.pageKeys)
    }
  }

  // Fetch expedited, error, and hold order counts (skip in settings mode)
  useEffect(() => {
    if (isSettingsMode) return

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
    const interval = setInterval(fetchCounts, 30000)
    return () => clearInterval(interval)
  }, [isSettingsMode])

  // ---- Permission-based filtering ----

  function canAccessPage(href: string): boolean {
    // If admin is previewing a group, use that group's pages
    if (isAdmin && previewPages) {
      const pageKey = PATH_TO_KEY[href]
      if (!pageKey) return false
      return previewPages.includes(pageKey)
    }
    if (isAdmin) return true
    const pageKey = PATH_TO_KEY[href]
    if (!pageKey) return false
    return allowedPages.includes(pageKey)
  }

  // Filter sections and items based on permissions
  const visibleSections = navSections
    .map(section => {
      const visibleItems = section.items.filter(item => {
        // External links: check using the internal href
        return canAccessPage(item.href)
      })
      if (visibleItems.length === 0) return null
      return { ...section, items: visibleItems }
    })
    .filter((section): section is NavSection => section !== null)

  // Filter settings items based on role
  const visibleSettingsItems = settingsNavItems.filter(item => !item.adminOnly || isAdmin)

  // Settings mode sidebar
  if (isSettingsMode) {
    return (
      <div className="w-64 bg-gray-900 text-white h-screen flex flex-col">
        <div className="p-6 border-b border-gray-800 flex-shrink-0">
          <h1 className="text-xl font-bold">E-Com Batch Tool</h1>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto min-h-0">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-4 py-2.5 mb-4 text-sm text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Operations
          </Link>

          <h2 className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Settings
          </h2>
          <ul className="space-y-1">
            {visibleSettingsItems.map((item) => {
              const isActive = item.href === '/settings/account'
                ? pathname === '/settings/account'
                : item.href === '/settings'
                  ? pathname === '/settings'
                  : pathname.startsWith(item.href)

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`block px-4 py-2.5 rounded-lg transition-colors text-sm ${
                      isActive
                        ? 'bg-green-600 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    {item.name}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-800 flex-shrink-0">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full px-4 py-2 border-2 border-red-600 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loggingOut ? 'Logging out...' : 'Log out'}
          </button>
        </div>
      </div>
    )
  }

  // Operations mode sidebar
  return (
    <div className="w-64 bg-gray-900 text-white h-screen flex flex-col">
      <div className="p-6 border-b border-gray-800 flex-shrink-0">
        <h1 className="text-xl font-bold">E-Com Batch Tool</h1>
      </div>

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
                        <a href={item.externalHref} target="_blank" rel="noopener noreferrer" className="flex-1">
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
            <h2 className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {section.title}
            </h2>
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
                        <a href={item.externalHref} target="_blank" rel="noopener noreferrer" className="flex-1">
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

      <div className="p-4 border-t border-gray-800 flex-shrink-0 space-y-3">
        {/* Settings link for all users */}
        <Link
          href={isAdmin ? '/settings' : '/settings/account'}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </Link>

        {/* Admin: Preview as group */}
        {isAdmin && groups.length > 0 && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Preview as group</label>
            <select
              value={previewGroupId || ''}
              onChange={(e) => handlePreviewChange(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-gray-800 text-gray-300 border border-gray-700 rounded-lg focus:border-blue-500 focus:outline-none"
            >
              <option value="">Admin (full access)</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Preview mode indicator */}
        {previewPages && (
          <div className="flex items-center justify-between bg-blue-900/40 border border-blue-700 rounded-lg px-3 py-1.5">
            <span className="text-xs text-blue-300 font-medium">Preview mode</span>
            <button
              onClick={() => { setPreviewGroupId(null); setPreviewPages(null) }}
              className="text-xs text-blue-400 hover:text-white font-medium"
            >
              Exit
            </button>
          </div>
        )}

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full px-4 py-2 border-2 border-red-600 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loggingOut ? 'Logging out...' : 'Log out'}
        </button>
      </div>
    </div>
  )
}
