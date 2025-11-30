'use client'

import { useState, useMemo } from 'react'
import type { GoCardlessBank } from '@/lib/goCardless/types'
import { initiateConnection } from '../../actions'

interface BankListProps {
  accountId: string
  banks: GoCardlessBank[]
  countryCode: string
}

export default function BankList({
  accountId,
  banks,
  countryCode,
}: BankListProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isInitiating, setIsInitiating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter banks by search term
  const filteredBanks = useMemo(() => {
    if (!searchTerm) return banks
    const lowerSearch = searchTerm.toLowerCase()
    return banks.filter((bank) => bank.name.toLowerCase().includes(lowerSearch))
  }, [banks, searchTerm])

  const handleBankSelect = async (bank: GoCardlessBank) => {
    setIsInitiating(true)
    setError(null)

    try {
      const result = await initiateConnection(
        accountId,
        bank.id,
        countryCode,
        bank.id,
      )

      if (result.success && result.link) {
        // Redirect to GoCardless OAuth
        window.location.assign(result.link)
      } else {
        setError(result.error ?? 'Failed to initiate connection')
        setIsInitiating(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setIsInitiating(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div>
        <label htmlFor="bank-search" className="sr-only">
          Search banks
        </label>
        <input
          type="text"
          id="bank-search"
          placeholder="Search banks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          disabled={isInitiating}
          className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 text-red-800 border border-red-200 p-4 rounded-md">
          {error}
        </div>
      )}

      {/* Loading State */}
      {isInitiating && (
        <div className="bg-blue-50 text-blue-800 border border-blue-200 p-4 rounded-md">
          Initiating connection... Please wait.
        </div>
      )}

      {/* Bank List */}
      <div className="border border-gray-300 rounded-md overflow-hidden">
        <div className="max-h-96 overflow-y-auto">
          {filteredBanks.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              No banks found matching &quot;{searchTerm}&quot;
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {filteredBanks.map((bank) => (
                <li key={bank.id}>
                  <button
                    type="button"
                    onClick={() => handleBankSelect(bank)}
                    disabled={isInitiating}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors focus:outline-none focus:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">
                        {bank.name}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Showing {filteredBanks.length} of {banks.length} banks
      </p>
    </div>
  )
}
