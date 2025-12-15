'use client'

import { useState } from 'react'
import { Transaction, type Entry } from 'beancount'
import { reExecuteRulesForTransaction } from '@/app/_actions/imports'
import { useRouter } from 'next/navigation'
import { ChevronDownIcon } from '@heroicons/react/24/outline'

interface RuleInfo {
  matchedRules: Array<{
    ruleId: string
    ruleName: string
    actionsApplied: string[]
    applicationType: 'automatic' | 'manual'
  }>
  warnings: string[]
}

interface TransactionCardProps {
  entries: Entry[]
  transaction: Transaction // Primary transaction for header display
  originalTransaction?: Transaction
  ruleInfo?: RuleInfo
  index: number
  importId: string
  transactionId: string
  isSelected: boolean
  onSelectionChange: (selected: boolean) => void
}

function formatFirstPosting(transaction: Transaction): string {
  if (transaction.postings.length === 0) {
    return 'No postings'
  }

  const posting = transaction.postings[0]
  return posting.amount ? posting.amount.toString() : '0'
}

function getOutputFileName(transaction: Transaction): string | null {
  const outputFile = transaction.internalMetadata?.outputFile
  if (!outputFile || typeof outputFile !== 'string') {
    return null
  }
  // Extract filename from path (handles both Unix and Windows paths)
  const parts = outputFile.split(/[\\/]/)
  return parts[parts.length - 1] ?? outputFile
}

export default function TransactionCard({
  entries,
  transaction,
  originalTransaction,
  ruleInfo,
  index,
  importId,
  transactionId,
  isSelected,
  onSelectionChange,
}: TransactionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isReExecuting, setIsReExecuting] = useState(false)
  const [activeTab, setActiveTab] = useState<
    'processed' | 'original' | 'appliedRules'
  >('processed')
  const router = useRouter()

  const hasRules = ruleInfo && ruleInfo.matchedRules.length > 0
  const hasWarnings = ruleInfo && ruleInfo.warnings.length > 0

  const handleReExecuteRules = async () => {
    setIsReExecuting(true)
    try {
      const result = await reExecuteRulesForTransaction(importId, transactionId)
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
      setIsReExecuting(false)
    }
  }

  return (
    <div
      className={`border rounded-lg mb-3 ${
        hasWarnings
          ? 'border-yellow-300'
          : hasRules
            ? 'border-blue-300'
            : 'border-gray-200'
      }`}
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        aria-expanded={isExpanded}
        aria-controls={`transaction-content-${index}`}
      >
        <div className="flex items-center gap-3 flex-1 text-left">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation()
              onSelectionChange(e.target.checked)
            }}
            className="h-4 w-4 rounded border-gray-300"
          />
          <span className="text-sm text-gray-500 font-mono">
            {transaction.date.toJSON()}
          </span>
          <span className="font-medium text-gray-900">{transaction.payee}</span>
          {transaction.narration && (
            <span className="text-sm text-gray-600">
              {transaction.narration}
            </span>
          )}
          <span className="text-sm text-gray-700 font-mono">
            {formatFirstPosting(transaction)}
          </span>
          {ruleInfo?.matchedRules.map((rule, idx) => (
            <span
              key={idx}
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                rule.applicationType === 'manual'
                  ? 'bg-purple-100 text-purple-800'
                  : 'bg-blue-100 text-blue-800'
              }`}
            >
              {rule.applicationType === 'manual' ? '✓ Manual' : '✓ Auto'}
            </span>
          ))}
          {hasWarnings && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
              Warning
            </span>
          )}
        </div>
        <ChevronDownIcon
          className={`h-5 w-5 text-gray-500 transform transition-transform flex-shrink-0 ml-2 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isExpanded && (
        <div
          id={`transaction-content-${index}`}
          className="border-t border-gray-200"
        >
          {hasRules && originalTransaction ? (
            <div className="p-4">
              {/* Tab Navigation */}
              <div className="flex border-b border-gray-200 mb-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('processed')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'processed'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                  aria-selected={activeTab === 'processed'}
                  role="tab"
                >
                  Processed
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('original')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'original'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                  aria-selected={activeTab === 'original'}
                  role="tab"
                >
                  Original
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('appliedRules')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'appliedRules'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                  aria-selected={activeTab === 'appliedRules'}
                  role="tab"
                >
                  Applied Rules
                </button>
              </div>

              {/* Tab Content */}
              <div role="tabpanel">
                {activeTab === 'processed' ? (
                  <>
                    <div className="bg-gray-900 text-green-400 p-3 rounded font-mono text-xs overflow-auto max-h-96">
                      <pre>
                        {entries.map((e) => e.toFormattedString()).join('\n')}
                      </pre>
                    </div>
                    {getOutputFileName(transaction) && (
                      <div className="text-sm text-gray-600 mt-2 px-1">
                        output file changed to .../
                        {getOutputFileName(transaction)}
                      </div>
                    )}
                  </>
                ) : activeTab === 'original' ? (
                  <div className="bg-gray-900 text-green-400 p-3 rounded font-mono text-xs overflow-auto max-h-96">
                    <pre>{originalTransaction.toFormattedString()}</pre>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {ruleInfo?.matchedRules.map((rule, idx) => (
                      <div
                        key={idx}
                        className="text-sm flex items-start justify-between"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-gray-900">
                              {rule.ruleName}
                            </div>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                rule.applicationType === 'manual'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {rule.applicationType}
                            </span>
                          </div>
                          {rule.actionsApplied.length > 0 && (
                            <div className="text-xs text-gray-600 ml-4 mt-1">
                              Actions: {rule.actionsApplied.join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4">
              <div className="bg-gray-900 text-green-400 p-3 rounded font-mono text-xs overflow-auto max-h-96">
                <pre>
                  {entries.map((e) => e.toFormattedString()).join('\n')}
                </pre>
              </div>
            </div>
          )}

          {hasWarnings && ruleInfo && (
            <div className="px-4 pb-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <h4 className="text-sm font-semibold text-yellow-900 mb-2">
                  Warnings
                </h4>
                <ul className="list-disc list-inside space-y-1">
                  {ruleInfo.warnings.map((warning, idx) => (
                    <li key={idx} className="text-sm text-yellow-800">
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Re-execute Rules Button */}
          <div className="px-4 pb-4">
            <button
              type="button"
              onClick={handleReExecuteRules}
              disabled={isReExecuting}
              className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-medium rounded transition-colors"
            >
              {isReExecuting ? 'Re-running Rules...' : 'Re-run Rules'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
