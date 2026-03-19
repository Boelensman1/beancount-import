'use client'

import { useState } from 'react'
import { reconnectGoCardless } from './connect-gocardless/actions'

interface ReconnectButtonProps {
  accountId: string
}

export default function ReconnectButton({ accountId }: ReconnectButtonProps) {
  const [isInitiating, setIsInitiating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleReconnect = async () => {
    setIsInitiating(true)
    setError(null)

    try {
      const result = await reconnectGoCardless(accountId)

      if (result.success && result.link) {
        window.location.assign(result.link)
      } else {
        setError(result.error ?? 'Failed to initiate reconnection')
        setIsInitiating(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setIsInitiating(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleReconnect}
        disabled={isInitiating}
        className="px-3 py-1 text-sm font-medium text-orange-600 hover:text-orange-700 border border-orange-600 rounded-md hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isInitiating ? 'Reconnecting...' : 'Reconnect'}
      </button>
      {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
    </div>
  )
}
