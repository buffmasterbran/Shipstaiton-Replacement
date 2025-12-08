'use client'

import { useRouter } from 'next/navigation'

export default function RefreshButton() {
  const router = useRouter()

  const handleRefresh = () => {
    router.refresh()
  }

  return (
    <button
      onClick={handleRefresh}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
    >
      Refresh
    </button>
  )
}




