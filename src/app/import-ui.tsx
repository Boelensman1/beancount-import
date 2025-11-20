'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Account, BatchImport } from '@/lib/db/types'
import Link from 'next/link'
import {
  runImport as runImportAction,
  createBatch,
  deleteBatch,
} from './actions'

interface ImportUIProps {
  accounts: Account[]
  batches: BatchImport[]
}

type ImportStatus = 'idle' | 'running' | 'completed' | 'error'

type AccountOutput = {
  accountId: string
  accountName: string
  output: string
  status: 'idle' | 'running' | 'completed' | 'error'
  isExpanded: boolean
}

export default function ImportUI({ accounts, batches }: ImportUIProps) {
  const router = useRouter()
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(
    new Set(),
  )
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [accountOutputs, setAccountOutputs] = useState<
    Map<string, AccountOutput>
  >(new Map())
  const [batchId, setBatchId] = useState<string>('')
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  const handleCheckboxChange = (accountId: string) => {
    const newSelected = new Set(selectedAccounts)
    if (newSelected.has(accountId)) {
      newSelected.delete(accountId)
    } else {
      newSelected.add(accountId)
    }
    setSelectedAccounts(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedAccounts.size === accounts.length) {
      setSelectedAccounts(new Set())
    } else {
      setSelectedAccounts(new Set(accounts.map((acc) => acc.id)))
    }
  }

  // Filter function to remove internal metadata from display
  const filterOutputForDisplay = (text: string): string => {
    // Remove __IMPORT_ID__ marker and everything after it
    const idMarkerIndex = text.indexOf('__IMPORT_ID__')
    if (idMarkerIndex !== -1) {
      return text.substring(0, idMarkerIndex)
    }
    return text
  }

  // Status indicator component
  const StatusIndicator = ({ status }: { status: AccountOutput['status'] }) => {
    switch (status) {
      case 'running':
        return (
          <span className="flex items-center text-blue-600 text-sm">
            <svg
              className="animate-spin h-4 w-4 mr-2"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Running...
          </span>
        )
      case 'completed':
        return (
          <span className="flex items-center text-green-600 text-sm">
            <svg
              className="h-4 w-4 mr-2"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            Completed
          </span>
        )
      case 'error':
        return (
          <span className="flex items-center text-red-600 text-sm">
            <svg
              className="h-4 w-4 mr-2"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            Error
          </span>
        )
      default:
        return null
    }
  }

  // Account output card component
  const AccountOutputCard = ({
    accountOutput,
    onToggle,
  }: {
    accountOutput: AccountOutput
    onToggle: () => void
  }) => {
    const getBorderColor = (status: AccountOutput['status']) => {
      switch (status) {
        case 'running':
          return 'border-blue-300'
        case 'completed':
          return 'border-green-300'
        case 'error':
          return 'border-red-300'
        default:
          return 'border-gray-200'
      }
    }

    return (
      <div
        className={`border rounded-lg mb-3 ${getBorderColor(accountOutput.status)}`}
      >
        <button
          type="button"
          onClick={onToggle}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          aria-expanded={accountOutput.isExpanded}
          aria-controls={`output-content-${accountOutput.accountId}`}
        >
          <div className="flex items-center gap-3">
            <span className="font-medium text-gray-900">
              {accountOutput.accountName}
            </span>
            <StatusIndicator status={accountOutput.status} />
          </div>
          <svg
            className={`h-5 w-5 text-gray-500 transform transition-transform ${
              accountOutput.isExpanded ? 'rotate-180' : ''
            }`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {accountOutput.isExpanded && (
          <div
            id={`output-content-${accountOutput.accountId}`}
            className="border-t border-gray-200"
          >
            <div
              id={`output-terminal-${accountOutput.accountId}`}
              className="bg-gray-900 text-green-400 p-4 font-mono text-sm h-96 overflow-auto whitespace-pre-wrap"
            >
              {accountOutput.output || 'No output yet...'}
            </div>
          </div>
        )}
      </div>
    )
  }

  const handleToggleExpand = (accountId: string) => {
    setAccountOutputs((prev) => {
      const next = new Map(prev)
      const current = next.get(accountId)
      if (current) {
        next.set(accountId, {
          ...current,
          isExpanded: !current.isExpanded,
        })
      }
      return next
    })
  }

  const runImport = async (accountId: string, batchId: string) => {
    const account = accounts.find((acc) => acc.id === accountId)
    const accountName = account?.name || accountId

    // Initialize this account's output entry
    setAccountOutputs((prev) => {
      const next = new Map(prev)
      next.set(accountId, {
        accountId,
        accountName,
        output: '',
        status: 'running',
        isExpanded: false, // Collapsed by default
      })
      return next
    })

    try {
      // Call the server action to get the stream
      const stream = await runImportAction(accountId, batchId)

      // Read the streaming response
      const reader = stream.getReader()
      const decoder = new TextDecoder()
      let fullOutput = ''
      let lastDisplayedLength = 0

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        const text = decoder.decode(value, { stream: true })
        fullOutput += text

        // Filter the text for display (hide internal metadata)
        const filteredText = filterOutputForDisplay(fullOutput)

        // Only update if we have new content to display
        if (filteredText.length > lastDisplayedLength) {
          const newContent = filteredText.substring(lastDisplayedLength)
          lastDisplayedLength = filteredText.length

          // Update ONLY this account's output
          setAccountOutputs((prev) => {
            const next = new Map(prev)
            const current = next.get(accountId)
            if (current) {
              next.set(accountId, {
                ...current,
                output: current.output + newContent,
              })
            }
            return next
          })
        }

        // Auto-scroll this account's terminal
        setTimeout(() => {
          const outputEl = document.getElementById(
            `output-terminal-${accountId}`,
          )
          if (outputEl) {
            outputEl.scrollTop = outputEl.scrollHeight
          }
        }, 0)
      }

      // Mark as completed
      setAccountOutputs((prev) => {
        const next = new Map(prev)
        const current = next.get(accountId)
        if (current) {
          next.set(accountId, {
            ...current,
            status: 'completed',
          })
        }
        return next
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      // Mark as error
      setAccountOutputs((prev) => {
        const next = new Map(prev)
        const current = next.get(accountId)
        if (current) {
          next.set(accountId, {
            ...current,
            status: 'error',
            output: current.output + `\nError: ${errorMsg}\n`,
          })
        }
        return next
      })
      setStatus('error')
    }
  }

  const handleImport = async () => {
    if (selectedAccounts.size === 0) return

    setStatus('running')
    setAccountOutputs(new Map())

    const accountsToImport = Array.from(selectedAccounts)

    // Create a batch for this import
    const newBatchId = await createBatch(accountsToImport)
    setBatchId(newBatchId)

    // Run all imports in parallel
    await Promise.all(
      accountsToImport.map((accountId) => runImport(accountId, newBatchId)),
    )

    setStatus('completed')
  }

  const handleDeleteBatch = async (id: string, batch: BatchImport) => {
    const accountNames = batch.accountIds
      .map((accountId) => {
        const account = accounts.find((acc) => acc.id === accountId)
        return account?.name || 'Unknown'
      })
      .join(', ')

    if (
      !confirm(
        `Are you sure you want to delete this batch import?\n\nAccounts: ${accountNames}`,
      )
    ) {
      return
    }

    setDeletingIds((prev) => new Set(prev).add(id))

    try {
      const success = await deleteBatch(id)
      if (success) {
        // Refresh the page to show updated list
        router.refresh()
      } else {
        alert('Failed to delete batch')
        setDeletingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    } catch {
      alert('Error deleting batch')
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const isRunning = status === 'running'
  const canImport = selectedAccounts.size > 0 && !isRunning

  // Helper function to format timestamp as relative time
  const formatRelativeTime = (timestamp: string): string => {
    const now = new Date()
    const then = new Date(timestamp)
    const diffMs = now.getTime() - then.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins === 1) return '1 minute ago'
    if (diffMins < 60) return `${diffMins} minutes ago`
    if (diffHours === 1) return '1 hour ago'
    if (diffHours < 24) return `${diffHours} hours ago`
    if (diffDays === 1) return '1 day ago'
    if (diffDays < 7) return `${diffDays} days ago`

    // For older dates, show the date
    return then.toLocaleDateString()
  }

  if (accounts.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white shadow-md rounded-lg px-8 pt-6 pb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Import Accounts
            </h1>
            <div className="p-4 rounded-md bg-yellow-50 text-yellow-800 border border-yellow-200 mb-4">
              No accounts configured. Please configure accounts first.
            </div>
            <Link
              href="/config"
              className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
            >
              Go to Configuration
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* WIP Batches List */}
        {batches.length > 0 && (
          <div className="bg-white shadow-md rounded-lg px-8 pt-6 pb-8 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              WIP Imports
            </h2>
            <div className="space-y-3">
              {batches.map((batch) => {
                const accountNames = batch.accountIds
                  .map((id) => {
                    const account = accounts.find((acc) => acc.id === id)
                    return account?.name || 'Unknown'
                  })
                  .join(', ')
                return (
                  <div
                    key={batch.id}
                    className="p-4 border border-gray-200 rounded-md hover:border-blue-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          Batch Import • {batch.accountIds.length}{' '}
                          {batch.accountIds.length === 1
                            ? 'account'
                            : 'accounts'}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {accountNames}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {formatRelativeTime(batch.timestamp)}
                        </div>
                      </div>
                      <div className="ml-4 flex gap-2">
                        <Link
                          href={`/review/${batch.id}`}
                          className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                        >
                          Review
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDeleteBatch(batch.id, batch)}
                          disabled={deletingIds.has(batch.id)}
                          className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md disabled:bg-red-400 disabled:cursor-not-allowed"
                        >
                          {deletingIds.has(batch.id) ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="bg-white shadow-md rounded-lg px-8 pt-6 pb-8 mb-4">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              Import Accounts
            </h1>
            <Link
              href="/config"
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
            >
              Manage Accounts
            </Link>
          </div>

          {/* Account Selection */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <label className="block text-sm font-medium text-gray-700">
                Select Accounts to Import
              </label>
              <button
                type="button"
                onClick={handleSelectAll}
                disabled={isRunning}
                className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {selectedAccounts.size === accounts.length
                  ? 'Deselect All'
                  : 'Select All'}
              </button>
            </div>

            <div className="space-y-2 p-4 border border-gray-300 rounded-md bg-gray-50">
              {accounts.map((account) => (
                <label
                  key={account.id}
                  className={`flex items-start p-3 bg-white border border-gray-200 rounded-md hover:border-blue-300 cursor-pointer ${
                    isRunning ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedAccounts.has(account.id)}
                    onChange={() => handleCheckboxChange(account.id)}
                    disabled={isRunning}
                    className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:cursor-not-allowed"
                  />
                  <div className="ml-3 flex-1">
                    <div className="text-sm font-medium text-gray-900">
                      {account.name}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Import Button */}
          <button
            type="button"
            onClick={handleImport}
            disabled={!canImport}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            {isRunning
              ? `Importing... (${selectedAccounts.size} account${selectedAccounts.size > 1 ? 's' : ''})`
              : `Import Selected (${selectedAccounts.size})`}
          </button>

          {/* Status Message */}
          {status === 'completed' && batchId && (
            <div className="mt-4 p-4 rounded-md bg-green-50 text-green-800 border border-green-200">
              <div className="mb-3">Import completed successfully</div>
              <Link
                href={`/review/${batchId}`}
                className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium"
              >
                Review Import
              </Link>
            </div>
          )}
          {status === 'error' && (
            <div className="mt-4 p-4 rounded-md bg-red-50 text-red-800 border border-red-200">
              Import encountered errors (see output below)
            </div>
          )}

          {/* Account Output Cards */}
          {accountOutputs.size > 0 && (
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Import Output
              </label>
              <div className="space-y-0">
                {Array.from(accountOutputs.values()).map((accountOutput) => (
                  <AccountOutputCard
                    key={accountOutput.accountId}
                    accountOutput={accountOutput}
                    onToggle={() => handleToggleExpand(accountOutput.accountId)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
