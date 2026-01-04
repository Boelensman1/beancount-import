'use client'

import { useState } from 'react'
import type { SerializedAccount } from '@/lib/db/types'
import { useRulesForAccount } from '@/hooks/useRules'
import { RuleList } from './rule-list'

interface RulesPageClientProps {
  accounts: SerializedAccount[]
}

export function RulesPageClient({ accounts }: RulesPageClientProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    accounts[0]?.id ?? '',
  )

  const {
    data: rulesData,
    isLoading: loading,
    error,
    refetch: loadRules,
  } = useRulesForAccount(selectedAccountId)

  const rules = rulesData?.rules ?? []
  const accountName = rulesData?.accountName ?? ''

  return (
    <div className="space-y-6">
      {/* Account Selector */}
      <div className="rounded border border-gray-300 bg-white p-4">
        <label className="block text-sm font-medium">Select Account</label>
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="mt-2 w-full max-w-md rounded border border-gray-300 px-3 py-2"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} ({account.rules.length} rule
              {account.rules.length !== 1 ? 's' : ''})
            </option>
          ))}
        </select>
      </div>

      {/* Loading/Error States */}
      {loading && (
        <div className="rounded border border-gray-300 bg-white p-8 text-center">
          <p className="text-gray-600">Loading rules...</p>
        </div>
      )}

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-4">
          <p className="text-red-700">
            Error:{' '}
            {error instanceof Error ? error.message : 'Failed to load rules'}
          </p>
        </div>
      )}

      {/* Rule List */}
      {!loading && !error && selectedAccountId && (
        <RuleList
          accountId={selectedAccountId}
          accountName={accountName}
          rules={rules}
          onUpdate={loadRules}
        />
      )}
    </div>
  )
}
