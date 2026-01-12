'use client'

import { useRouter } from 'next/navigation'
import type { SerializedAccount } from '@/lib/db/types'
import { useRulesForAccount } from '@/hooks/useRules'
import { RuleList } from './rule-list'

interface RulesPageClientProps {
  accountId: string
  accounts: SerializedAccount[]
}

export function RulesPageClient({ accountId, accounts }: RulesPageClientProps) {
  const router = useRouter()

  const {
    data: rulesData,
    isLoading: loading,
    error,
  } = useRulesForAccount(accountId)

  const rules = rulesData?.rules ?? []
  const accountName = rulesData?.accountName ?? ''

  const handleAccountChange = (newAccountId: string) => {
    router.replace(`/rules/${newAccountId}`)
  }

  const handleEditRule = (ruleId: string) => {
    router.push(`/rules/${accountId}/${ruleId}`)
  }

  const handleCreateRule = () => {
    router.push(`/rules/${accountId}/new`)
  }

  return (
    <div className="space-y-6">
      {/* Account Selector */}
      <div className="rounded border border-gray-300 bg-white p-4">
        <label className="block text-sm font-medium">Select Account</label>
        <select
          value={accountId}
          onChange={(e) => handleAccountChange(e.target.value)}
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
      {!loading && !error && accountId && (
        <RuleList
          accountId={accountId}
          accountName={accountName}
          rules={rules}
          onEditRule={handleEditRule}
          onCreateRule={handleCreateRule}
        />
      )}
    </div>
  )
}
