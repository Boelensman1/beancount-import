'use client'

import { useActionState, useState, useMemo } from 'react'
import { Temporal } from '@js-temporal/polyfill'
import Link from 'next/link'
import { TextInputWithVariableHelp } from '@/app/components/textInputWithVariableHelp'
import { ConfigSchema } from '@/lib/db/schema'
import type {
  GoCardlessAccountConfig,
  Account,
  Config,
  SerializedConfig,
} from '@/lib/db/types'
import ConfirmModal from '@/app/components/confirm-modal'

interface Defaults {
  beangulpCommand: string
  postProcessCommand?: string
  csvPostProcessCommand?: string
}

interface GoCardlessConfig {
  secretId: string
  secretKey: string
}

interface ConfigFormProps {
  serializedInitialConfig: SerializedConfig
  updateConfig: (
    prevState: { message: string; success: boolean } | null,
    formData: FormData,
  ) => Promise<{ message: string; success: boolean }>
}

function getConnectionStatus(
  goCardless?: GoCardlessAccountConfig,
): 'not-connected' | 'expired' | 'connected' {
  if (!goCardless) return 'not-connected'
  const now = Temporal.Now.instant()
  const isExpired =
    Temporal.Instant.compare(goCardless.endUserAgreementValidTill, now) < 0
  return isExpired ? 'expired' : 'connected'
}

export default function ConfigForm({
  serializedInitialConfig,
  updateConfig,
}: ConfigFormProps) {
  // Parse entire config through ConfigSchema to restore Temporal objects
  const initialConfig = useMemo(() => {
    const result = ConfigSchema.safeParse(serializedInitialConfig)
    if (!result.success) {
      console.error('Failed to parse config:', result.error)
      return serializedInitialConfig as Config
    }
    return result.data
  }, [serializedInitialConfig])

  const [accounts, setAccounts] = useState<Account[]>(initialConfig.accounts)
  const [defaults, setDefaults] = useState<Defaults>(initialConfig.defaults)
  const [goCardless, setGoCardless] = useState<GoCardlessConfig | undefined>(
    initialConfig.goCardless,
  )
  const [state, formAction, isPending] = useActionState(updateConfig, null)
  const [disconnectingAccount, setDisconnectingAccount] = useState<
    string | null
  >(null)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
  const [disconnectAccountId, setDisconnectAccountId] = useState<string | null>(
    null,
  )

  const addAccount = () => {
    setAccounts([
      ...accounts,
      {
        id: crypto.randomUUID(),
        name: '',
        defaultOutputFile: '',
        csvFilename: '$account.$importedFrom.$importedTo.grabber.csv',
        rules: [],
      },
    ])
  }

  const removeAccount = (index: number) => {
    setAccounts(accounts.filter((_, i) => i !== index))
  }

  const updateAccount = (
    index: number,
    field: keyof Omit<Account, 'id' | 'goCardless' | 'rules'>,
    value: string,
  ) => {
    const newAccounts = [...accounts]
    newAccounts[index][field] = value
    setAccounts(newAccounts)
  }

  const handleDisconnect = (accountId: string) => {
    setDisconnectAccountId(accountId)
    setShowDisconnectConfirm(true)
  }

  const executeDisconnect = async () => {
    if (!disconnectAccountId) return

    setShowDisconnectConfirm(false)
    setDisconnectingAccount(disconnectAccountId)

    try {
      // Import the action dynamically to avoid circular dependencies
      const { disconnectGoCardless } =
        await import('./connect-gocardless/actions')
      const result = await disconnectGoCardless(disconnectAccountId)

      if (result.success) {
        // Update local state to remove goCardless field
        setAccounts((prev) =>
          prev.map((acc) =>
            acc.id === disconnectAccountId
              ? { ...acc, goCardless: undefined }
              : acc,
          ),
        )
      } else {
        alert(`Failed to disconnect: ${result.message}`)
      }
    } catch (error) {
      alert(
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    } finally {
      setDisconnectingAccount(null)
      setDisconnectAccountId(null)
    }
  }

  const handleSubmit = (formData: FormData) => {
    formData.set('accounts', JSON.stringify(accounts))
    formData.set('defaults', JSON.stringify(defaults))
    if (goCardless) {
      formData.set('goCardless', JSON.stringify(goCardless))
    }
    return formAction(formData)
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {/* Defaults Section */}
      <div className="space-y-4">
        <label className="block text-sm font-medium text-gray-700">
          Default Settings
        </label>
        <div className="p-4 border border-gray-300 rounded-md space-y-3">
          <div>
            <label
              htmlFor="beangulp-command"
              className="block text-sm font-medium text-gray-600 mb-1"
            >
              Beangulp Command
            </label>
            <TextInputWithVariableHelp
              type="text"
              id="beangulp-command"
              disabled={isPending}
              value={defaults.beangulpCommand ?? ''}
              onChange={(e) =>
                setDefaults({ ...defaults, beangulpCommand: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="Beangulp command to execute"
              variables={[
                { variable: 'account', explanation: 'The account name' },
                {
                  variable: 'importedFrom',
                  explanation: 'Start date of import',
                },
                { variable: 'importedTo', explanation: 'End date of import' },
              ]}
            />
          </div>
          <div>
            <label
              htmlFor="defaults-post-process-command"
              className="block text-sm font-medium text-gray-600 mb-1"
            >
              Post-Processing Command
            </label>
            <TextInputWithVariableHelp
              type="text"
              id="defaults-post-process-command"
              disabled={isPending}
              value={defaults.postProcessCommand ?? ''}
              onChange={(e) =>
                setDefaults({ ...defaults, postProcessCommand: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="Command to execute after import completes"
              variables={[
                { variable: 'account', explanation: 'The account name' },
                {
                  variable: 'outputFile',
                  explanation: 'Path to the output file',
                },
              ]}
            />
          </div>
          <div>
            <label
              htmlFor="defaults-csv-post-process-command"
              className="block text-sm font-medium text-gray-600 mb-1"
            >
              CSV Post-Processing Command
            </label>
            <TextInputWithVariableHelp
              type="text"
              id="defaults-csv-post-process-command"
              disabled={isPending}
              value={defaults.csvPostProcessCommand ?? ''}
              onChange={(e) =>
                setDefaults({
                  ...defaults,
                  csvPostProcessCommand: e.target.value,
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="Command to execute for each CSV file"
              variables={[
                { variable: 'csvPath', explanation: 'Path to the CSV file' },
                {
                  variable: 'csvDir',
                  explanation: 'Path to the directory containing the CSV file',
                },
                { variable: 'account', explanation: 'The account name' },
                {
                  variable: 'importedFrom',
                  explanation: 'Start date of import (YYYY-MM-DD)',
                },
                {
                  variable: 'importedTo',
                  explanation: 'End date of import (YYYY-MM-DD)',
                },
                {
                  variable: 'outputFile',
                  explanation: 'Account default output file',
                },
              ]}
            />
          </div>
        </div>
      </div>

      {/* GoCardless Section */}
      <div className="space-y-4">
        <label className="block text-sm font-medium text-gray-700">
          GoCardless Integration
        </label>
        <div className="p-4 border border-gray-300 rounded-md space-y-3">
          <div>
            <label
              htmlFor="gocardless-secret-id"
              className="block text-sm font-medium text-gray-600 mb-1"
            >
              Secret ID
            </label>
            <input
              type="text"
              id="gocardless-secret-id"
              disabled={isPending}
              value={goCardless?.secretId ?? ''}
              onChange={(e) =>
                setGoCardless({
                  secretId: e.target.value,
                  secretKey: goCardless?.secretKey ?? '',
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="GoCardless Secret ID"
            />
          </div>
          <div>
            <label
              htmlFor="gocardless-secret-key"
              className="block text-sm font-medium text-gray-600 mb-1"
            >
              Secret Key
            </label>
            <input
              type="password"
              id="gocardless-secret-key"
              disabled={isPending}
              value={goCardless?.secretKey ?? ''}
              onChange={(e) =>
                setGoCardless({
                  secretId: goCardless?.secretId ?? '',
                  secretKey: e.target.value,
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="GoCardless Secret Key"
            />
          </div>
        </div>
      </div>

      {/* Accounts Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            Accounts
          </label>
          <button
            type="button"
            onClick={addAccount}
            disabled={isPending}
            className="px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-600 rounded-md hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Add Account
          </button>
        </div>

        {accounts.length === 0 && (
          <p className="text-sm text-gray-500 italic">
            No accounts configured. Click &quot;Add Account&quot; to get
            started.
          </p>
        )}

        {accounts.map((account, index) => (
          <div
            key={index}
            className="p-4 border border-gray-300 rounded-md space-y-3"
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">
                Account {index + 1}
              </span>
              <button
                type="button"
                onClick={() => removeAccount(index)}
                disabled={isPending}
                className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Remove
              </button>
            </div>

            <div>
              <label
                htmlFor={`account-name-${index}`}
                className="block text-sm font-medium text-gray-600 mb-1"
              >
                Name
              </label>
              <input
                type="text"
                id={`account-name-${index}`}
                required
                disabled={isPending}
                value={account.name}
                onChange={(e) => updateAccount(index, 'name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="Account name"
              />
            </div>

            <div>
              <label
                htmlFor={`account-output-file-${index}`}
                className="block text-sm font-medium text-gray-600 mb-1"
              >
                Default Output File
              </label>
              <input
                type="text"
                id={`account-output-file-${index}`}
                required
                disabled={isPending}
                value={account.defaultOutputFile}
                onChange={(e) =>
                  updateAccount(index, 'defaultOutputFile', e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="Path to output file (e.g., /path/to/transactions.beancount)"
              />
            </div>

            <div>
              <label
                htmlFor={`account-csv-filename-${index}`}
                className="block text-sm font-medium text-gray-600 mb-1"
              >
                CSV Filename
              </label>
              <TextInputWithVariableHelp
                type="text"
                id={`account-csv-filename-${index}`}
                required
                disabled={isPending}
                value={account.csvFilename}
                onChange={(e) =>
                  updateAccount(index, 'csvFilename', e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="$account.$importedFrom.$importedTo.grabber.csv"
                variables={[
                  { variable: 'account', explanation: 'The account name' },
                  {
                    variable: 'importedFrom',
                    explanation: 'Start date of import',
                  },
                  { variable: 'importedTo', explanation: 'End date of import' },
                ]}
              />
            </div>

            {/* GoCardless Connection Status */}
            <div className="pt-3 border-t border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-600">
                  GoCardless Connection
                </label>
                {(() => {
                  const status = getConnectionStatus(account.goCardless)
                  const isDisconnecting = disconnectingAccount === account.id

                  if (status === 'not-connected') {
                    return (
                      <Link
                        href={`/config/connect-gocardless/${account.id}`}
                        className="px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-600 rounded-md hover:bg-blue-50 transition-colors"
                      >
                        Connect
                      </Link>
                    )
                  }

                  if (status === 'expired') {
                    return (
                      <Link
                        href={`/config/connect-gocardless/${account.id}`}
                        className="px-3 py-1 text-sm font-medium text-orange-600 hover:text-orange-700 border border-orange-600 rounded-md hover:bg-orange-50 transition-colors"
                      >
                        Reconnect
                      </Link>
                    )
                  }

                  return (
                    <button
                      type="button"
                      onClick={() => handleDisconnect(account.id)}
                      disabled={isDisconnecting || isPending}
                      className="px-3 py-1 text-sm font-medium text-red-600 hover:text-red-700 border border-red-600 rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                    </button>
                  )
                })()}
              </div>

              {(() => {
                const status = getConnectionStatus(account.goCardless)

                if (status === 'not-connected') {
                  return (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span className="inline-block w-2 h-2 rounded-full bg-gray-400"></span>
                      <span>Not connected</span>
                    </div>
                  )
                }

                if (status === 'expired') {
                  return (
                    <div className="flex items-center gap-2 text-sm text-orange-600">
                      <span className="inline-block w-2 h-2 rounded-full bg-orange-500"></span>
                      <span>Connection expired</span>
                    </div>
                  )
                }

                const validUntil = account
                  .goCardless!.endUserAgreementValidTill.toZonedDateTimeISO(
                    'UTC',
                  )
                  .toPlainDate()
                  .toString()

                return (
                  <div>
                    <div className="flex items-center gap-2 text-sm text-green-600 mb-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                      <span>Connected</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      Valid until: {validUntil}
                    </div>
                    {account.goCardless!.accounts.length > 0 && (
                      <div className="text-xs text-gray-500">
                        {account.goCardless!.accounts.length} account
                        {account.goCardless!.accounts.length === 1
                          ? ''
                          : 's'}{' '}
                        linked
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        ))}
      </div>

      {state && (
        <div
          className={`p-4 rounded-md ${
            state.success
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {state.message}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? 'Saving...' : 'Save Config'}
      </button>

      <ConfirmModal
        isOpen={showDisconnectConfirm}
        onClose={() => {
          setShowDisconnectConfirm(false)
          setDisconnectAccountId(null)
        }}
        onConfirm={executeDisconnect}
        title="Disconnect GoCardless"
        message="Are you sure you want to disconnect this account from GoCardless?"
        confirmLabel="Disconnect"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />
    </form>
  )
}
