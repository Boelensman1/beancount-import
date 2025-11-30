'use client'

import { useState } from 'react'
import { Transaction } from 'beancount'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type {
  ImportResult,
  BatchImport,
  SerializedAccount,
} from '@/lib/db/types'
import TransactionCard from './transaction-card'
import { reExecuteRulesForImport, confirmImport } from '@/app/actions'

interface BatchReviewDisplayProps {
  batch: BatchImport
  imports: ImportResult[]
  accounts: SerializedAccount[]
}

export default function BatchReviewDisplay({
  batch,
  imports,
  accounts,
}: BatchReviewDisplayProps) {
  const [activeTab, setActiveTab] = useState(0)
  const [isReExecutingAll, setIsReExecutingAll] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [confirmResult, setConfirmResult] = useState<{
    success: boolean
    error?: string
    filesModified?: string[]
  } | null>(null)
  const router = useRouter()

  // Imports are already sorted by account order from the server
  const sortedImports = imports

  const activeImport = sortedImports[activeTab]

  const getAccountName = (accountId: string) => {
    const account = accounts.find((acc) => acc.id === accountId)
    return account?.name ?? 'Unknown Account'
  }

  // Get processed transactions from the import
  const processedTransactions = activeImport?.transactions ?? []

  const handleReExecuteAllRules = async () => {
    if (!activeImport) return

    setIsReExecutingAll(true)
    try {
      const result = await reExecuteRulesForImport(activeImport.id)
      if (result.success) {
        router.refresh()
      } else {
        alert(`Failed to re-execute rules: ${result.error}`)
      }
    } catch (error) {
      alert(
        `Error re-executing rules: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      setIsReExecutingAll(false)
    }
  }

  const handleConfirmImport = async () => {
    const totalTransactionCount = imports.reduce(
      (sum, imp) => sum + imp.transactionCount,
      0,
    )

    const confirmed = window.confirm(
      `Write ${totalTransactionCount} transaction${totalTransactionCount === 1 ? '' : 's'} to beancount files?\n\nThis will append transactions to their target files and run post-process commands.`,
    )

    if (!confirmed) return

    setIsConfirming(true)
    setConfirmResult(null)

    try {
      const result = await confirmImport(batch.id)
      setConfirmResult(result)

      if (result.success) {
        // Redirect to home after a brief delay to show success message
        setTimeout(() => {
          router.push('/')
        }, 2000)
      }
    } catch (error) {
      setConfirmResult({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setIsConfirming(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white shadow-md rounded-lg px-8 pt-6 pb-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Import Review</h1>
            <div className="flex gap-3 items-center">
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={isConfirming || imports.length === 0}
                className="py-2 px-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium rounded transition-colors"
              >
                {isConfirming ? 'Confirming...' : 'Confirm Import'}
              </button>
              <Link
                href="/"
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
              >
                Back to Import
              </Link>
            </div>
          </div>

          {/* Success/Error Messages */}
          {confirmResult && confirmResult.success && (
            <div className="mb-6 p-4 bg-green-50 rounded-md border border-green-200">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-green-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">
                    Import confirmed successfully!
                  </h3>
                  {confirmResult.filesModified &&
                    confirmResult.filesModified.length > 0 && (
                      <div className="mt-2 text-sm text-green-700">
                        <p className="font-medium">Modified files:</p>
                        <ul className="list-disc list-inside mt-1">
                          {confirmResult.filesModified.map((file) => (
                            <li key={file} className="font-mono text-xs">
                              {file}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  <p className="mt-2 text-sm text-green-700">
                    Redirecting to home...
                  </p>
                </div>
              </div>
            </div>
          )}

          {confirmResult && !confirmResult.success && (
            <div className="mb-6 p-4 bg-red-50 rounded-md border border-red-200">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-red-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    Import failed
                  </h3>
                  {confirmResult.error && (
                    <p className="mt-2 text-sm text-red-700">
                      {confirmResult.error}
                    </p>
                  )}
                  <p className="mt-2 text-sm text-red-700">
                    All changes have been rolled back.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Batch Metadata */}
          <div className="mb-6 p-4 bg-gray-50 rounded-md border border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">
              Import Details
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Batch ID:</span>
                <span className="ml-2 font-mono text-xs text-gray-900">
                  {batch.id}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Timestamp:</span>
                <span className="ml-2 text-gray-900">
                  {new Date(batch.timestamp).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Accounts:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {batch.accountIds.length}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Total Transactions:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {imports.reduce((sum, imp) => sum + imp.transactionCount, 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          {sortedImports.length > 0 && (
            <>
              <div className="border-b border-gray-200 mb-6">
                <nav className="-mb-px flex space-x-4">
                  {sortedImports.map((imp, index) => {
                    const accountName = getAccountName(imp.accountId)
                    return (
                      <button
                        key={imp.id}
                        type="button"
                        onClick={() => setActiveTab(index)}
                        className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                          activeTab === index
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        {accountName}
                        <span className="ml-2 text-xs text-gray-400">
                          ({imp.transactionCount})
                        </span>
                      </button>
                    )
                  })}
                </nav>
              </div>

              {/* Active Import Content */}
              {activeImport && (
                <>
                  {/* Import Metadata */}
                  <div className="mb-6 p-4 bg-blue-50 rounded-md border border-blue-200">
                    <div className="flex justify-between items-start mb-3">
                      <h2 className="text-sm font-semibold text-blue-900">
                        {getAccountName(activeImport.accountId)}
                      </h2>
                      <button
                        type="button"
                        onClick={handleReExecuteAllRules}
                        disabled={isReExecutingAll}
                        className="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-xs font-medium rounded transition-colors"
                      >
                        {isReExecutingAll
                          ? 'Re-running...'
                          : 'Re-run All Rules'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-blue-700">Import ID:</span>
                        <span className="ml-2 font-mono text-xs text-blue-900">
                          {activeImport.id}
                        </span>
                      </div>
                      <div>
                        <span className="text-blue-700">Transactions:</span>
                        <span className="ml-2 font-medium text-blue-900">
                          {processedTransactions.length}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Transactions */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Transactions ({processedTransactions.length})
                    </label>
                    {processedTransactions.length > 0 ? (
                      <div className="space-y-0">
                        {processedTransactions.map((processedTx, index) => {
                          const originalTransaction = Transaction.fromJSON(
                            processedTx.originalTransaction,
                          )
                          const transaction = Transaction.fromJSON(
                            processedTx.processedTransaction,
                          )

                          return (
                            <TransactionCard
                              key={processedTx.id}
                              transaction={transaction}
                              originalTransaction={originalTransaction}
                              ruleInfo={{
                                matchedRules: processedTx.matchedRules,
                                warnings: processedTx.warnings,
                              }}
                              index={index}
                              importId={activeImport.id}
                              transactionId={processedTx.id}
                            />
                          )
                        })}
                      </div>
                    ) : (
                      <div className="p-4 rounded-md bg-gray-50 text-gray-600 border border-gray-200">
                        No transactions found
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {sortedImports.length === 0 && (
            <div className="p-4 rounded-md bg-yellow-50 text-yellow-800 border border-yellow-200">
              No imports found in this batch
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
