'use client'

import { useState } from 'react'
import type { SerializedAccount } from '@/lib/db/types'
import { useGlobalVariables, useAccountVariables } from '@/hooks/useVariables'
import { VariableList } from './variable-list'

interface VariablesPageClientProps {
  accounts: SerializedAccount[]
}

type VariableScope = 'global' | 'account'

export function VariablesPageClient({ accounts }: VariablesPageClientProps) {
  const [scope, setScope] = useState<VariableScope>('global')
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    accounts[0]?.id ?? '',
  )

  const {
    data: globalVariables,
    isLoading: globalLoading,
    error: globalError,
    refetch: refetchGlobal,
  } = useGlobalVariables()

  const {
    data: accountData,
    isLoading: accountLoading,
    error: accountError,
    refetch: refetchAccount,
  } = useAccountVariables(selectedAccountId)

  // Determine which data to show based on scope
  const loading = scope === 'global' ? globalLoading : accountLoading
  const error = scope === 'global' ? globalError : accountError
  const variables =
    scope === 'global'
      ? (globalVariables ?? [])
      : (accountData?.variables ?? [])
  const accountName =
    scope === 'account' ? (accountData?.accountName ?? '') : ''
  const loadVariables = scope === 'global' ? refetchGlobal : refetchAccount

  return (
    <div className="space-y-6">
      {/* Scope Selector */}
      <div className="rounded border border-gray-300 bg-white p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div>
            <label className="block text-sm font-medium">Variable Scope</label>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setScope('global')}
                className={`rounded px-4 py-2 text-sm font-medium ${
                  scope === 'global'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Global
              </button>
              <button
                onClick={() => setScope('account')}
                className={`rounded px-4 py-2 text-sm font-medium ${
                  scope === 'account'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Per Account
              </button>
            </div>
          </div>

          {scope === 'account' && (
            <div className="flex-1">
              <label className="block text-sm font-medium">
                Select Account
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="mt-2 w-full max-w-md rounded border border-gray-300 px-3 py-2"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {scope === 'global' && (
          <p className="mt-3 text-sm text-gray-500">
            Global variables are available to all accounts. Per-account
            variables with the same name will override global variables.
          </p>
        )}
        {scope === 'account' && (
          <p className="mt-3 text-sm text-gray-500">
            Account-specific variables override global variables with the same
            name.
          </p>
        )}
      </div>

      {/* Loading/Error States */}
      {loading && (
        <div className="rounded border border-gray-300 bg-white p-8 text-center">
          <p className="text-gray-600">Loading variables...</p>
        </div>
      )}

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-4">
          <p className="text-red-700">
            Error:{' '}
            {error instanceof Error
              ? error.message
              : 'Failed to load variables'}
          </p>
        </div>
      )}

      {/* Variable List */}
      {!loading && !error && (
        <VariableList
          scope={scope}
          accountId={scope === 'account' ? selectedAccountId : undefined}
          accountName={accountName}
          variables={variables}
          onUpdate={loadVariables}
        />
      )}
    </div>
  )
}
