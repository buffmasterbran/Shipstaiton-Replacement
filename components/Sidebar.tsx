'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

interface NavItem {
  name: string
  href: string
  icon?: string
}

const navItems: NavItem[] = [
  { name: 'All Orders', href: '/' },
  { name: 'Singles Orders', href: '/singles' },
  { name: 'Bulk Orders', href: '/bulk' },
  { name: 'Box Size Specific', href: '/box-size' },
  { name: 'Batches', href: '/batches' },
  { name: 'Settings', href: '/settings' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="w-64 bg-gray-900 text-white min-h-screen flex flex-col">
      {/* Logo/Title */}
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-xl font-bold">E-Com Batch Tool</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
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


