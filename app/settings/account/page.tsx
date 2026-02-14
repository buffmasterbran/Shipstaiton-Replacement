'use client'

import { useState, useEffect } from 'react'

interface UserInfo {
  username: string
  fullName: string
  isAdmin: boolean
  groupName?: string
}

export default function AccountSettingsPage() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch('/api/auth/check')
        if (res.ok) {
          const data = await res.json()
          if (data.authenticated) {
            setUser({
              username: data.user.username,
              fullName: data.user.fullName,
              isAdmin: data.user.isAdmin,
              groupName: data.user.groupName,
            })
          }
        }
      } catch {
        // non-critical
      }
    }
    fetchUser()
  }, [])

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (!newPassword.trim()) {
      setMessage({ type: 'error', text: 'Please enter a new password' })
      return
    }
    if (newPassword.length < 4) {
      setMessage({ type: 'error', text: 'Password must be at least 4 characters' })
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' })
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newPassword.trim() }),
      })
      const data = await res.json()

      if (data.success) {
        setMessage({ type: 'success', text: 'Password updated successfully' })
        setNewPassword('')
        setConfirmPassword('')
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update password' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to update password' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Account</h1>

      {/* User Info */}
      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Account Details</h2>
        {user ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-500 w-24">Name</span>
              <span className="text-sm text-gray-900">{user.fullName}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-500 w-24">Username</span>
              <span className="text-sm text-gray-900 font-mono">{user.username}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-500 w-24">Role</span>
              <span className="text-sm text-gray-900">
                {user.isAdmin ? (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-bold rounded">Admin</span>
                ) : (
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                    {user.groupName || 'No group assigned'}
                  </span>
                )}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-400">Loading...</div>
        )}
      </div>

      {/* Password Reset */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Change Password</h2>
        <form onSubmit={handlePasswordReset} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-green-500 focus:border-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-green-500 focus:border-green-500"
            />
          </div>

          {message && (
            <div className={`text-sm px-4 py-2 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
