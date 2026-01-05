'use client'

import { useState, useMemo } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Temporal } from '@js-temporal/polyfill'
import Link from 'next/link'
import { TextInputWithVariableHelp } from '@/app/components/textInputWithVariableHelp'
import { TextInput, PasswordInput, Checkbox } from '@/app/components/inputs'
import { ConfigSchema } from '@/lib/db/schema'
import type {
  GoCardlessAccountConfig,
  Account,
  Config,
  SerializedConfig,
} from '@/lib/db/types'
import ConfirmModal from '@/app/components/confirm-modal'
import { ConfigFormSchema, type ConfigFormData } from './config-form.schema'

interface ConfigFormProps {
  serializedInitialConfig: SerializedConfig
  updateConfig: (
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

  // Store full account data (including goCardless) separately since form only manages editable fields
  const [fullAccounts, setFullAccounts] = useState<Account[]>(
    initialConfig.accounts,
  )

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ConfigFormData>({
    resolver: zodResolver(ConfigFormSchema),
    defaultValues: {
      defaults: {
        beangulpCommand: initialConfig.defaults.beangulpCommand ?? '',
        postProcessCommand: initialConfig.defaults.postProcessCommand ?? '',
        csvPostProcessCommand:
          initialConfig.defaults.csvPostProcessCommand ?? '',
      },
      goCardless: initialConfig.goCardless
        ? {
            secretId: initialConfig.goCardless.secretId,
            secretKey: initialConfig.goCardless.secretKey,
          }
        : undefined,
      accounts: initialConfig.accounts.map((acc) => ({
        id: acc.id,
        name: acc.name,
        defaultOutputFile: acc.defaultOutputFile,
        csvFilename:
          acc.csvFilename ?? '$account.$importedFrom.$importedTo.grabber.csv',
        beangulpCommand: acc.beangulpCommand ?? '',
        postProcessCommand: acc.postProcessCommand ?? '',
        csvPostProcessCommand: acc.csvPostProcessCommand ?? '',
      })),
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'accounts',
  })

  // Watch accounts to get actual account IDs (fields only has react-hook-form internal IDs)
  const watchedAccounts = watch('accounts')

  const [serverResponse, setServerResponse] = useState<{
    message: string
    success: boolean
  } | null>(null)
  const [disconnectingAccount, setDisconnectingAccount] = useState<
    string | null
  >(null)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
  const [disconnectAccountId, setDisconnectAccountId] = useState<string | null>(
    null,
  )

  const addAccount = () => {
    const newId = crypto.randomUUID()
    append({
      id: newId,
      name: '',
      defaultOutputFile: '',
      csvFilename: '$account.$importedFrom.$importedTo.grabber.csv',
      beangulpCommand: '',
      postProcessCommand: '',
      csvPostProcessCommand: '',
    })
    // Also add to fullAccounts to track goCardless separately
    setFullAccounts((prev) => [
      ...prev,
      {
        id: newId,
        name: '',
        defaultOutputFile: '',
        csvFilename: '$account.$importedFrom.$importedTo.grabber.csv',
        rules: [],
        variables: [],
      },
    ])
  }

  const removeAccount = (index: number) => {
    const accountId = fields[index].id
    remove(index)
    setFullAccounts((prev) => prev.filter((acc) => acc.id !== accountId))
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
        setFullAccounts((prev) =>
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

  const onSubmit = async (data: ConfigFormData) => {
    setServerResponse(null)

    // Merge form data with full account data (to preserve goCardless, rules, variables)
    const mergedAccounts = data.accounts.map((formAccount) => {
      const fullAccount = fullAccounts.find((a) => a.id === formAccount.id)
      return {
        ...fullAccount,
        id: formAccount.id,
        name: formAccount.name,
        defaultOutputFile: formAccount.defaultOutputFile,
        csvFilename: formAccount.csvFilename,
        beangulpCommand: formAccount.beangulpCommand ?? undefined,
        postProcessCommand: formAccount.postProcessCommand ?? undefined,
        csvPostProcessCommand: formAccount.csvPostProcessCommand ?? undefined,
        rules: fullAccount?.rules ?? [],
        variables: fullAccount?.variables ?? [],
      }
    })

    const formData = new FormData()
    formData.set('accounts', JSON.stringify(mergedAccounts))
    formData.set('defaults', JSON.stringify(data.defaults))
    // Only include goCardless if secretId or secretKey have actual values
    if (data.goCardless?.secretId || data.goCardless?.secretKey) {
      formData.set('goCardless', JSON.stringify(data.goCardless))
    }

    try {
      const result = await updateConfig(formData)
      setServerResponse(result)
    } catch (err) {
      setServerResponse({
        message: err instanceof Error ? err.message : 'An error occurred',
        success: false,
      })
    }
  }

  // Get goCardless data for an account from fullAccounts
  const getAccountGoCardless = (accountId: string | undefined) => {
    if (!accountId) return undefined
    return fullAccounts.find((a) => a.id === accountId)?.goCardless
  }

  // Update goCardless reversePayee setting
  const updateReversePayee = (accountId: string, value: boolean) => {
    setFullAccounts((prev) =>
      prev.map((acc) =>
        acc.id === accountId
          ? {
              ...acc,
              goCardless: {
                ...acc.goCardless!,
                reversePayee: value,
              },
            }
          : acc,
      ),
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
            <Controller
              name="defaults.beangulpCommand"
              control={control}
              render={({ field }) => (
                <TextInputWithVariableHelp
                  id="beangulp-command"
                  disabled={isSubmitting}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="Beangulp command to execute"
                  variables={[
                    { variable: 'account', explanation: 'The account name' },
                    {
                      variable: 'importedFrom',
                      explanation: 'Start date of import',
                    },
                    {
                      variable: 'importedTo',
                      explanation: 'End date of import',
                    },
                  ]}
                  error={errors.defaults?.beangulpCommand?.message}
                />
              )}
            />
          </div>
          <div>
            <label
              htmlFor="defaults-post-process-command"
              className="block text-sm font-medium text-gray-600 mb-1"
            >
              Post-Processing Command
            </label>
            <Controller
              name="defaults.postProcessCommand"
              control={control}
              render={({ field }) => (
                <TextInputWithVariableHelp
                  id="defaults-post-process-command"
                  disabled={isSubmitting}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
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
              )}
            />
          </div>
          <div>
            <label
              htmlFor="defaults-csv-post-process-command"
              className="block text-sm font-medium text-gray-600 mb-1"
            >
              CSV Post-Processing Command
            </label>
            <Controller
              name="defaults.csvPostProcessCommand"
              control={control}
              render={({ field }) => (
                <TextInputWithVariableHelp
                  id="defaults-csv-post-process-command"
                  disabled={isSubmitting}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="Command to execute for each CSV file"
                  variables={[
                    {
                      variable: 'csvPath',
                      explanation: 'Path to the CSV file',
                    },
                    {
                      variable: 'csvDir',
                      explanation:
                        'Path to the directory containing the CSV file',
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
              )}
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
            <TextInput
              id="gocardless-secret-id"
              disabled={isSubmitting}
              {...register('goCardless.secretId')}
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
            <PasswordInput
              id="gocardless-secret-key"
              disabled={isSubmitting}
              {...register('goCardless.secretKey')}
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
            disabled={isSubmitting}
            className="px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-600 rounded-md hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Add Account
          </button>
        </div>

        {fields.length === 0 && (
          <p className="text-sm text-gray-500 italic">
            No accounts configured. Click &quot;Add Account&quot; to get
            started.
          </p>
        )}

        {fields.map((field, index) => {
          // Use watchedAccounts to get the actual account ID (field.id is react-hook-form's internal ID)
          const accountId = watchedAccounts?.[index]?.id
          const accountGoCardless = getAccountGoCardless(accountId)
          const status = getConnectionStatus(accountGoCardless)
          const isUnsaved = !initialConfig.accounts.some(
            (a) => a.id === accountId,
          )
          const isDisconnecting = disconnectingAccount === accountId

          return (
            <div
              key={field.id}
              className="p-4 border border-gray-300 rounded-md space-y-3"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Account {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeAccount(index)}
                  disabled={isSubmitting}
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
                <TextInput
                  id={`account-name-${index}`}
                  disabled={isSubmitting}
                  {...register(`accounts.${index}.name`)}
                  placeholder="Account name"
                  error={errors.accounts?.[index]?.name?.message}
                />
              </div>

              <div>
                <label
                  htmlFor={`account-output-file-${index}`}
                  className="block text-sm font-medium text-gray-600 mb-1"
                >
                  Default Output File
                </label>
                <TextInput
                  id={`account-output-file-${index}`}
                  disabled={isSubmitting}
                  {...register(`accounts.${index}.defaultOutputFile`)}
                  placeholder="Path to output file (e.g., /path/to/transactions.beancount)"
                  error={errors.accounts?.[index]?.defaultOutputFile?.message}
                />
              </div>

              <div>
                <label
                  htmlFor={`account-csv-filename-${index}`}
                  className="block text-sm font-medium text-gray-600 mb-1"
                >
                  CSV Filename
                </label>
                <Controller
                  name={`accounts.${index}.csvFilename`}
                  control={control}
                  render={({ field: controllerField }) => (
                    <TextInputWithVariableHelp
                      id={`account-csv-filename-${index}`}
                      disabled={isSubmitting}
                      value={controllerField.value}
                      onChange={controllerField.onChange}
                      onBlur={controllerField.onBlur}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      placeholder="$account.$importedFrom.$importedTo.grabber.csv"
                      variables={[
                        {
                          variable: 'account',
                          explanation: 'The account name',
                        },
                        {
                          variable: 'importedFrom',
                          explanation: 'Start date of import',
                        },
                        {
                          variable: 'importedTo',
                          explanation: 'End date of import',
                        },
                      ]}
                      error={errors.accounts?.[index]?.csvFilename?.message}
                    />
                  )}
                />
              </div>

              {/* Per-Account Command Overrides */}
              <div className="pt-3 border-t border-gray-200 space-y-3">
                <label className="block text-sm font-medium text-gray-600">
                  Command Overrides (optional)
                </label>
                <div>
                  <label
                    htmlFor={`account-beangulp-command-${index}`}
                    className="block text-sm font-medium text-gray-500 mb-1"
                  >
                    Beangulp Command
                  </label>
                  <Controller
                    name={`accounts.${index}.beangulpCommand`}
                    control={control}
                    render={({ field: controllerField }) => (
                      <TextInputWithVariableHelp
                        id={`account-beangulp-command-${index}`}
                        disabled={isSubmitting}
                        value={controllerField.value ?? ''}
                        onChange={controllerField.onChange}
                        onBlur={controllerField.onBlur}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                        placeholder="Leave empty to use default"
                        variables={[
                          {
                            variable: 'account',
                            explanation: 'The account name',
                          },
                          {
                            variable: 'importedFrom',
                            explanation: 'Start date of import',
                          },
                          {
                            variable: 'importedTo',
                            explanation: 'End date of import',
                          },
                        ]}
                      />
                    )}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`account-post-process-command-${index}`}
                    className="block text-sm font-medium text-gray-500 mb-1"
                  >
                    Post-Processing Command
                  </label>
                  <Controller
                    name={`accounts.${index}.postProcessCommand`}
                    control={control}
                    render={({ field: controllerField }) => (
                      <TextInputWithVariableHelp
                        id={`account-post-process-command-${index}`}
                        disabled={isSubmitting}
                        value={controllerField.value ?? ''}
                        onChange={controllerField.onChange}
                        onBlur={controllerField.onBlur}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                        placeholder="Leave empty to use default"
                        variables={[
                          {
                            variable: 'account',
                            explanation: 'The account name',
                          },
                          {
                            variable: 'outputFile',
                            explanation: 'Path to the output file',
                          },
                        ]}
                      />
                    )}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`account-csv-post-process-command-${index}`}
                    className="block text-sm font-medium text-gray-500 mb-1"
                  >
                    CSV Post-Processing Command
                  </label>
                  <Controller
                    name={`accounts.${index}.csvPostProcessCommand`}
                    control={control}
                    render={({ field: controllerField }) => (
                      <TextInputWithVariableHelp
                        id={`account-csv-post-process-command-${index}`}
                        disabled={isSubmitting}
                        value={controllerField.value ?? ''}
                        onChange={controllerField.onChange}
                        onBlur={controllerField.onBlur}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                        placeholder="Leave empty to use default"
                        variables={[
                          {
                            variable: 'csvPath',
                            explanation: 'Path to the CSV file',
                          },
                          {
                            variable: 'csvDir',
                            explanation:
                              'Path to the directory containing the CSV file',
                          },
                          {
                            variable: 'account',
                            explanation: 'The account name',
                          },
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
                    )}
                  />
                </div>
              </div>

              {/* GoCardless Connection Status */}
              <div className="pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-600">
                    GoCardless Connection
                  </label>
                  {(() => {
                    if (isUnsaved) {
                      return null
                    }

                    if (status === 'not-connected') {
                      return (
                        <Link
                          href={`/config/connect-gocardless/${accountId}`}
                          className="px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-600 rounded-md hover:bg-blue-50 transition-colors"
                        >
                          Connect
                        </Link>
                      )
                    }

                    if (status === 'expired') {
                      return (
                        <Link
                          href={`/config/connect-gocardless/${accountId}`}
                          className="px-3 py-1 text-sm font-medium text-orange-600 hover:text-orange-700 border border-orange-600 rounded-md hover:bg-orange-50 transition-colors"
                        >
                          Reconnect
                        </Link>
                      )
                    }

                    return (
                      <button
                        type="button"
                        onClick={() => accountId && handleDisconnect(accountId)}
                        disabled={isDisconnecting || isSubmitting}
                        className="px-3 py-1 text-sm font-medium text-red-600 hover:text-red-700 border border-red-600 rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                      </button>
                    )
                  })()}
                </div>

                {(() => {
                  if (isUnsaved) {
                    return (
                      <div className="text-sm text-gray-500 italic">
                        Save config to enable connection
                      </div>
                    )
                  }

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

                  const validUntil =
                    accountGoCardless!.endUserAgreementValidTill
                      .toZonedDateTimeISO('UTC')
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
                      {accountGoCardless!.accounts.length > 0 && (
                        <div className="text-xs text-gray-500">
                          {accountGoCardless!.accounts.length} account
                          {accountGoCardless!.accounts.length === 1
                            ? ''
                            : 's'}{' '}
                          linked
                        </div>
                      )}
                      <div className="mt-2">
                        <Checkbox
                          label="Reverse payee (swap debtor/creditor)"
                          checked={accountGoCardless?.reversePayee ?? false}
                          onChange={(e) => {
                            if (accountId) {
                              updateReversePayee(accountId, e.target.checked)
                            }
                          }}
                          disabled={isSubmitting}
                        />
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          )
        })}
      </div>

      {serverResponse && (
        <div
          className={`p-4 rounded-md ${
            serverResponse.success
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {serverResponse.message}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
      >
        {isSubmitting ? 'Saving...' : 'Save Config'}
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
