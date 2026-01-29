'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export type UserRole = 'admin' | 'operator'

type RoleContextValue = {
  role: UserRole
  setRole: (role: UserRole) => void
}

const RoleContext = createContext<RoleContextValue | null>(null)

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>('admin')
  const value: RoleContextValue = { role, setRole }
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole() {
  const ctx = useContext(RoleContext)
  if (!ctx) {
    return { role: 'admin' as UserRole, setRole: () => {} }
  }
  return ctx
}
