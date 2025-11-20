'use client'

import { ParseResult } from 'beancount'
import Link from 'next/link'
import type { Account, ImportResult } from '@/lib/db/types'

interface ReviewDisplayProps {
  importResult: ImportResult
  accounts: Account[]
}

export default function ReviewDisplay({
  importResult,
  accounts,
}: ReviewDisplayProps) {
  const parseResult = ParseResult.fromJSON(importResult.parseResult)
  const account = accounts.find((acc) => acc.id === importResult.accountId)
  const accountName = account?.name || 'Unknown Account'

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white shadow-md rounded-lg px-8 pt-6 pb-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              Import Review: {accountName}
            </h1>
            <Link
              href="/"
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
            >
              Back to Import
            </Link>
          </div>

          {/* Import Metadata */}
          <div className="mb-6 p-4 bg-gray-50 rounded-md border border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">
              Import Details
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Account:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {accountName}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Import ID:</span>
                <span className="ml-2 font-mono text-xs text-gray-900">
                  {importResult.id}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Timestamp:</span>
                <span className="ml-2 text-gray-900">
                  {new Date(importResult.timestamp).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Transactions:</span>
                <span className="ml-2 font-medium text-gray-900">
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
        </div>
      </div>
    </div>
  )
}
