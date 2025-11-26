'use client'

import { useActionState, useState } from 'react'
import { TextInputWithVariableHelp } from '@/app/components/textInputWithVariableHelp'

interface Account {
  name: string
  importerCommand: string
  defaultOutputFile: string
}

interface Defaults {
  postProcessCommand?: string
}

interface ConfigFormProps {
  initialAccounts: Account[]
  initialDefaults: Defaults
  updateConfig: (
    prevState: { message: string; success: boolean } | null,
    formData: FormData,
  ) => Promise<{ message: string; success: boolean }>
}

export default function ConfigForm({
  initialAccounts,
  initialDefaults,
  updateConfig,
}: ConfigFormProps) {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [defaults, setDefaults] = useState<Defaults>(initialDefaults)
  const [state, formAction, isPending] = useActionState(updateConfig, null)

  const addAccount = () => {
    setAccounts([
      ...accounts,
      { name: '', importerCommand: '', defaultOutputFile: '' },
    ])
  }

  const removeAccount = (index: number) => {
    setAccounts(accounts.filter((_, i) => i !== index))
  }

  const updateAccount = (
    index: number,
    field: keyof Account,
    value: string,
  ) => {
    const newAccounts = [...accounts]
    newAccounts[index][field] = value
    setAccounts(newAccounts)
  }

  const handleSubmit = (formData: FormData) => {
    formData.set('accounts', JSON.stringify(accounts))
    formData.set('defaults', JSON.stringify(defaults))
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
              htmlFor="defaults-post-process-command"
              className="block text-sm font-medium text-gray-600 mb-1"
            >
              Post-Processing Command
            </label>
            <TextInputWithVariableHelp
              type="text"
              id="defaults-post-process-command"
              disabled={isPending}
              value={defaults.postProcessCommand || ''}
              onChange={(e) =>
                setDefaults({ ...defaults, postProcessCommand: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="Command to execute after import completes"
              variables={[
                { variable: 'account', explanation: 'The account name' },
                { variable: 'file', explanation: 'Path to the output file' },
              ]}
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
                htmlFor={`account-command-${index}`}
                className="block text-sm font-medium text-gray-600 mb-1"
              >
                Importer Command
              </label>
              <TextInputWithVariableHelp
                type="text"
                id={`account-command-${index}`}
                required
                disabled={isPending}
                value={account.importerCommand}
                onChange={(e) =>
                  updateAccount(index, 'importerCommand', e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="Command to run importer"
                variables={[
                  { variable: 'account', explanation: 'The account name' },
                ]}
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
    </form>
  )
}
