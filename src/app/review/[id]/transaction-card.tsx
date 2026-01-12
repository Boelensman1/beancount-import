'use client'

import { useState, useEffect } from 'react'
import { Transaction, Value, type Node } from 'beancount'
import {
  reExecuteRulesForTransaction,
  toggleSkippedRule,
  updateTransactionMeta,
} from '@/app/_actions/imports'
import { useRouter } from 'next/navigation'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import type { Rule } from '@/lib/db/types'

interface RuleInfo {
  matchedRules: Array<{
    ruleId: string
    ruleName: string
    actionsApplied: string[]
    applicationType: 'automatic' | 'manual'
  }>
  warnings: string[]
  skippedRuleIds: string[]
}

interface TransactionCardProps {
  nodes: Node[]
  transaction: Transaction // Primary transaction for header display
  originalTransaction?: Transaction
  ruleInfo?: RuleInfo
  accountRules?: Rule[]
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

function getNoteFromTransaction(transaction: Transaction): string {
  const noteValue = transaction.metadata?.note
  if (noteValue instanceof Value) {
    return String(noteValue.value)
  }
  return ''
}

function NodesCodeBlock({
  nodes,
  commentOut,
}: {
  nodes: Node[]
  commentOut: boolean
}) {
  const formattedNodes = commentOut
    ? nodes
        .map((e) =>
          e
            .toFormattedString()
            .split('\n')
            .map((line) => `; ${line}`)
            .join('\n'),
        )
        .join('\n')
    : nodes.map((e) => e.toFormattedString()).join('\n')

  return (
    <div className="bg-gray-900 text-green-400 p-3 rounded font-mono text-xs overflow-auto max-h-96">
      <pre>{formattedNodes}</pre>
    </div>
  )
}

export default function TransactionCard({
  nodes,
  transaction,
  originalTransaction,
  ruleInfo,
  accountRules = [],
  index,
  importId,
  transactionId,
  isSelected,
  onSelectionChange,
}: TransactionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isReExecuting, setIsReExecuting] = useState(false)
  const [isTogglingSkip, setIsTogglingSkip] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<
    'processed' | 'original' | 'appliedRules'
  >('processed')
  const router = useRouter()

  // Note state
  const currentNote = getNoteFromTransaction(transaction)
  const [noteValue, setNoteValue] = useState(currentNote)
  const [isSavingNote, setIsSavingNote] = useState(false)

  // Reset noteValue when transaction changes
  useEffect(() => {
    setNoteValue(currentNote)
  }, [currentNote])

  const hasNote = currentNote.length > 0
  const hasRules = ruleInfo && ruleInfo.matchedRules.length > 0
  const hasWarnings = ruleInfo && ruleInfo.warnings.length > 0
  const skippedRuleIds = ruleInfo?.skippedRuleIds ?? []

  // Get skipped rules with their names from accountRules
  const skippedRules = accountRules.filter((rule) =>
    skippedRuleIds.includes(rule.id),
  )

  const handleToggleSkip = async (ruleId: string) => {
    setIsTogglingSkip(ruleId)
    try {
      const result = await toggleSkippedRule(importId, transactionId, ruleId)
      if (result.success) {
        router.refresh()
      } else {
        alert(`Failed to toggle rule: ${result.error}`)
      }
    } catch (error) {
      alert(
        `Error toggling rule: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      setIsTogglingSkip(null)
    }
  }

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

  const handleSaveNote = async () => {
    setIsSavingNote(true)
    try {
      const trimmedNote = noteValue.trim()
      const result = await updateTransactionMeta(
        importId,
        transactionId,
        'note',
        trimmedNote.length > 0 ? trimmedNote : null,
      )
      if (result.success) {
        router.refresh()
      } else {
        alert(`Failed to save note: ${result.error}`)
      }
    } catch (error) {
      alert(
        `Error saving note: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      setIsSavingNote(false)
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
          {transaction.internalMetadata?.commentOut === true && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              ⊘ Commented Out
            </span>
          )}
          {hasNote && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              Note
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
                    <NodesCodeBlock
                      nodes={nodes}
                      commentOut={
                        transaction.internalMetadata?.commentOut === true
                      }
                    />
                    {getOutputFileName(transaction) && (
                      <div className="text-sm text-gray-600 mt-2 px-1">
                        output file changed to .../
                        {getOutputFileName(transaction)}
                      </div>
                    )}
                  </>
                ) : activeTab === 'original' ? (
                  <NodesCodeBlock
                    nodes={[originalTransaction]}
                    commentOut={false}
                  />
                ) : (
                  <div className="space-y-3">
                    {/* Applied Rules */}
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
                        <button
                          type="button"
                          onClick={() => handleToggleSkip(rule.ruleId)}
                          disabled={isTogglingSkip === rule.ruleId}
                          className="ml-2 px-2 py-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                        >
                          {isTogglingSkip === rule.ruleId ? '...' : 'Skip'}
                        </button>
                      </div>
                    ))}

                    {/* Skipped Rules */}
                    {skippedRules.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="text-xs font-medium text-gray-500 mb-2">
                          Skipped Rules
                        </div>
                        {skippedRules.map((rule) => (
                          <div
                            key={rule.id}
                            className="text-sm flex items-center justify-between text-gray-400"
                          >
                            <div className="flex items-center gap-2">
                              <div className="font-medium line-through">
                                {rule.name}
                              </div>
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                                skipped
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleSkip(rule.id)}
                              disabled={isTogglingSkip === rule.id}
                              className="ml-2 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                            >
                              {isTogglingSkip === rule.id ? '...' : 'Unskip'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Empty state */}
                    {(!ruleInfo?.matchedRules ||
                      ruleInfo.matchedRules.length === 0) &&
                      skippedRules.length === 0 && (
                        <div className="text-sm text-gray-500">
                          No rules applied
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4">
              <NodesCodeBlock
                nodes={nodes}
                commentOut={transaction.internalMetadata?.commentOut === true}
              />
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

          {/* Note Input */}
          <div className="px-4 pb-4">
            <label
              htmlFor={`note-${transactionId}`}
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Note
            </label>
            <div className="flex gap-2">
              <input
                id={`note-${transactionId}`}
                type="text"
                value={noteValue}
                onChange={(e) => setNoteValue(e.target.value)}
                placeholder="Add a note..."
                className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveNote}
                disabled={isSavingNote || noteValue === currentNote}
                className="px-3 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
              >
                {isSavingNote ? '...' : 'Save'}
              </button>
            </div>
          </div>

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
