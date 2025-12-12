'use client'

import { useState, useEffect, useCallback } from 'react'
import type { SerializedAccount, UserVariable } from '@/lib/db/types'
import { getGlobalVariables, getAccountVariables } from './actions'
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
  const [variables, setVariables] = useState<UserVariable[]>([])
  const [accountName, setAccountName] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadVariables = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      if (scope === 'global') {
        const globalVars = await getGlobalVariables()
        setVariables(globalVars)
        setAccountName('')
      } else {
        if (!selectedAccountId) {
          setVariables([])
          setAccountName('')
          return
        }
        const result = await getAccountVariables(selectedAccountId)
        if (result) {
          setVariables(result.variables)
          setAccountName(result.accountName)
        } else {
          setError('Account not found')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load variables')
    } finally {
      setLoading(false)
    }
  }, [scope, selectedAccountId])

  useEffect(() => {
    loadVariables()
  }, [loadVariables])

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
          <p className="text-red-700">Error: {error}</p>
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
