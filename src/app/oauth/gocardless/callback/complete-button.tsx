'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { completeGoCardlessConnection } from '@/app/config/connect-gocardless/actions'

interface CompleteButtonProps {
  accountId: string
  reqRef: string
  countryCode: string
  bankId: string
}

export default function CompleteButton({
  accountId,
  reqRef,
  countryCode,
  bankId,
}: CompleteButtonProps) {
  const router = useRouter()
  const [isCompleting, setIsCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleComplete = async () => {
    setIsCompleting(true)
    setError(null)

    try {
      const result = await completeGoCardlessConnection(
        accountId,
        reqRef,
        countryCode,
        bankId,
      )

      if (result.success) {
        // Redirect to config page
        router.push('/config')
      } else {
        setError(result.message)
        setIsCompleting(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setIsCompleting(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-800 border border-red-200 p-4 rounded-md">
          <p className="font-medium mb-1">Error completing connection:</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={handleComplete}
        disabled={isCompleting}
        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
      >
        {isCompleting ? 'Completing Connection...' : 'Complete Connection'}
      </button>
    </div>
  )
}
