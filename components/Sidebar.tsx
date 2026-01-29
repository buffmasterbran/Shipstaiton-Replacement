'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import type { UserRole } from './MainLayout'

interface NavItem {
  name: string
  href: string
  access: 'admin' | 'operator' // who can see this tab
  icon?: string
}

const navItems: NavItem[] = [
  { name: 'All Orders', href: '/', access: 'admin' },
  { name: 'Expedited Orders', href: '/expedited', access: 'admin' },
  { name: 'Singles', href: '/singles', access: 'admin' },
  { name: 'Bulk Orders', href: '/bulk', access: 'admin' },
  { name: 'Bulk Verification', href: '/bulk-verification', access: 'operator' },
  { name: 'Orders by Size', href: '/box-size', access: 'admin' },
  { name: 'Personalization', href: '/personalization', access: 'admin' },
  { name: 'Accessories', href: '/accessories', access: 'admin' },
  { name: 'International Orders', href: '/international', access: 'admin' },
  { name: 'Local Pickup Orders', href: '/local-pickup', access: 'operator' },
  { name: 'Analytics', href: '/analytics', access: 'operator' },
  { name: 'Receive Returns', href: '/returns', access: 'operator' },
  { name: 'Inventory Count', href: '/inventory-count', access: 'operator' },
  { name: 'Batches', href: '/batches', access: 'admin' },
  { name: 'ShipEngine Test', href: '/shipengine-test', access: 'admin' },
  { name: 'Settings', href: '/settings', access: 'admin' },
]

export default function Sidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()

  const visibleNavItems = role === 'operator'
    ? navItems.filter((item) => item.access === 'operator')
    : navItems

  return (
    <div className="w-64 bg-gray-900 text-white min-h-screen flex flex-col">
      {/* Logo/Title */}
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-xl font-bold">E-Com Batch Tool</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {visibleNavItems.map((item) => {
            const isActive = pathname === item.href || (item.href === '/' && pathname === '/')
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block px-4 py-3 rounded-lg transition-colors ${
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

      {/* Logout Button */}
      <div className="p-4 border-t border-gray-800">
        <button className="w-full px-4 py-2 border-2 border-red-600 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-colors">
          Log out
        </button>
      </div>
    </div>
  )
}


