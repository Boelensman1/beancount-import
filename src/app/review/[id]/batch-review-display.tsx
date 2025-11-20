'use client'

import { useState } from 'react'
import { ParseResult } from 'beancount'
import Link from 'next/link'
import type { Account, ImportResult, BatchImport } from '@/lib/db/types'

interface BatchReviewDisplayProps {
  batch: BatchImport
  imports: ImportResult[]
  accounts: Account[]
}

export default function BatchReviewDisplay({
  batch,
  imports,
  accounts,
}: BatchReviewDisplayProps) {
  const [activeTab, setActiveTab] = useState(0)

  // Sort imports by accountId to maintain consistent order
  const sortedImports = [...imports].sort((a, b) =>
    a.accountId.localeCompare(b.accountId),
  )

  const activeImport = sortedImports[activeTab]
  const parseResult = activeImport
    ? ParseResult.fromJSON(activeImport.parseResult)
    : null

  const getAccountName = (accountId: string) => {
    const account = accounts.find((acc) => acc.id === accountId)
    return account?.name || 'Unknown Account'
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white shadow-md rounded-lg px-8 pt-6 pb-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              Batch Import Review
            </h1>
            <Link
              href="/"
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
            >
              Back to Import
            </Link>
          </div>

          {/* Batch Metadata */}
          <div className="mb-6 p-4 bg-gray-50 rounded-md border border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">
              Batch Details
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
              {activeImport && parseResult && (
                <>
                  {/* Import Metadata */}
                  <div className="mb-6 p-4 bg-blue-50 rounded-md border border-blue-200">
                    <h2 className="text-sm font-semibold text-blue-900 mb-2">
                      {getAccountName(activeImport.accountId)}
                    </h2>
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
                          {parseResult.transactions.length}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Parsed Beancount Data */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Parsed Beancount Data
                    </label>
                    <div className="bg-gray-900 text-green-400 p-4 rounded-md overflow-auto font-mono text-xs max-h-[600px]">
                      <pre>{parseResult.toFormattedString()}</pre>
                    </div>
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
