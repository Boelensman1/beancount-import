'use client'

import { useState } from 'react'
import type { Rule, SelectorExpression, Action } from '@/lib/db/types'
import { useDeleteRule, useToggleRuleEnabled } from '@/hooks/useRules'
import ConfirmModal from '@/app/components/confirm-modal'

interface RuleListProps {
  accountId: string
  accountName: string
  rules: Rule[]
  onEditRule: (ruleId: string) => void
  onCreateRule: () => void
}

export function RuleList({
  accountId,
  accountName,
  rules,
  onEditRule,
  onCreateRule,
}: RuleListProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null)

  // Use React Query mutations
  const deleteMutation = useDeleteRule()
  const toggleMutation = useToggleRuleEnabled()

  const handleDelete = (ruleId: string) => {
    setDeleteRuleId(ruleId)
    setShowDeleteConfirm(true)
  }

  const executeDelete = () => {
    if (!deleteRuleId) return

    const ruleIdToDelete = deleteRuleId
    setShowDeleteConfirm(false)
    setDeleteRuleId(null)

    // Use mutation - it will auto-invalidate the cache
    deleteMutation.mutate(
      { accountId, ruleId: ruleIdToDelete },
      {
        onError: (error) => {
          alert(`Failed to delete rule: ${error.message}`)
        },
      },
    )
  }

  const handleToggle = (ruleId: string) => {
    // Use mutation - it will auto-invalidate the cache
    toggleMutation.mutate(
      { accountId, ruleId },
      {
        onError: (error) => {
          alert(`Failed to toggle rule: ${error.message}`)
        },
      },
    )
  }

  const summarizeSelector = (selector: SelectorExpression): string => {
    switch (selector.type) {
      case 'account':
        return `Account ${selector.matchType}: "${selector.pattern}"`
      case 'narration':
        return `Narration ${selector.matchType}: "${selector.pattern}"`
      case 'payee':
        return `Payee ${selector.matchType}: "${selector.pattern}"`
      case 'amount':
        return `Amount ${selector.min ? `>= ${selector.min}` : ''}${selector.min && selector.max ? ' and ' : ''}${selector.max ? `<= ${selector.max}` : ''}${selector.currency ? ` ${selector.currency}` : ''}`
      case 'date':
        return `Date ${selector.after ? `after ${selector.after}` : ''}${selector.after && selector.before ? ' and ' : ''}${selector.before ? `before ${selector.before}` : ''}`
      case 'flag':
        return `Flag: ${selector.flag}`
      case 'tag':
        return `Tag: ${selector.tag}`
      case 'never':
        return 'Never (manual only)'
      case 'and':
        return `ALL of (${selector.conditions.length} conditions)`
      case 'or':
        return `ANY of (${selector.conditions.length} conditions)`
      case 'not':
        return `NOT (${summarizeSelector(selector.condition)})`
      default:
        return 'Unknown selector'
    }
  }

  const summarizeActions = (actions: Action[]): string => {
    if (actions.length === 0) return 'No actions'
    if (actions.length === 1) {
      const action = actions[0]
      switch (action.type) {
        case 'modify_narration':
          return `Modify narration: ${action.operation}`
        case 'modify_payee':
          return `Modify payee: ${action.operation}`
        case 'add_posting':
          return `Add posting to ${action.account}`
        case 'modify_posting':
          return 'Modify posting'
        case 'add_metadata':
          return `Add metadata: ${action.key}`
        case 'add_tag':
          return `Add tag: ${action.tag}`
        case 'add_link':
          return `Add link: ${action.link}`
        case 'add_comment':
          return `Add comment (${action.position})`
        case 'set_flag':
          return `Set flag: ${action.flag}`
        case 'set_output_file':
          return `Set output file: ${action.outputFile}`
        case 'comment_out_transaction':
          return 'Comment out transaction'
      }
    }
    return `${actions.length} actions`
  }

  // Sort rules by priority (descending)
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Rules for {accountName}</h2>
          <p className="text-sm text-gray-600">
            {rules.length} rule{rules.length !== 1 ? 's' : ''} configured
          </p>
        </div>
        <button
          onClick={onCreateRule}
          className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
        >
          + Create Rule
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="rounded border border-gray-300 bg-gray-50 p-8 text-center">
          <p className="text-gray-600">
            No rules configured for this account yet.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Click &quot;Create Rule&quot; to add your first rule.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse rounded border border-gray-300">
            <thead className="bg-gray-100">
              <tr>
                <th className="border border-gray-300 px-4 py-2 text-left">
                  Priority
                </th>
                <th className="border border-gray-300 px-4 py-2 text-left">
                  Name
                </th>
                <th className="border border-gray-300 px-4 py-2 text-left">
                  Enabled
                </th>
                <th className="border border-gray-300 px-4 py-2 text-left">
                  Selector
                </th>
                <th className="border border-gray-300 px-4 py-2 text-left">
                  Actions
                </th>
                <th className="border border-gray-300 px-4 py-2 text-left">
                  Controls
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRules.map((rule) => (
                <tr
                  key={rule.id}
                  className={rule.enabled ? '' : 'bg-gray-50 opacity-60'}
                >
                  <td className="border border-gray-300 px-4 py-2 font-mono">
                    {rule.priority}
                  </td>
                  <td className="border border-gray-300 px-4 py-2">
                    <div className="font-medium">{rule.name}</div>
                    {rule.description && (
                      <div className="text-sm text-gray-600">
                        {rule.description}
                      </div>
                    )}
                  </td>
                  <td className="border border-gray-300 px-4 py-2">
                    <button
                      onClick={() => handleToggle(rule.id)}
                      disabled={
                        toggleMutation.isPending &&
                        toggleMutation.variables?.ruleId === rule.id
                      }
                      className={`rounded px-3 py-1 text-sm font-medium ${
                        rule.enabled
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-200 text-gray-600'
                      } hover:opacity-80 disabled:opacity-50`}
                    >
                      {toggleMutation.isPending &&
                      toggleMutation.variables?.ruleId === rule.id
                        ? '...'
                        : rule.enabled
                          ? 'Enabled'
                          : 'Disabled'}
                    </button>
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-sm">
                    {summarizeSelector(rule.selector)}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-sm">
                    {summarizeActions(rule.actions)}
                  </td>
                  <td className="border border-gray-300 px-4 py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => onEditRule(rule.id)}
                        className="rounded bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        disabled={
                          deleteMutation.isPending &&
                          deleteMutation.variables?.ruleId === rule.id
                        }
                        className="rounded bg-red-500 px-3 py-1 text-sm text-white hover:bg-red-600 disabled:opacity-50"
                      >
                        {deleteMutation.isPending &&
                        deleteMutation.variables?.ruleId === rule.id
                          ? '...'
                          : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false)
          setDeleteRuleId(null)
        }}
        onConfirm={executeDelete}
        title="Delete Rule"
        message="Are you sure you want to delete this rule?"
        confirmLabel="Delete"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />
    </div>
  )
}
