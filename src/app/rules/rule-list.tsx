'use client'

import { useState } from 'react'
import type { Rule, SelectorExpression, Action } from '@/lib/db/types'
import { deleteRule, toggleRuleEnabled } from './actions'
import { RuleForm } from './rule-form'

interface RuleListProps {
  accountId: string
  accountName: string
  rules: Rule[]
  onUpdate: () => void
}

export function RuleList({
  accountId,
  accountName,
  rules,
  onUpdate,
}: RuleListProps) {
  const [editingRule, setEditingRule] = useState<Rule | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const handleDelete = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return

    setDeletingId(ruleId)
    const result = await deleteRule(accountId, ruleId)
    setDeletingId(null)

    if (result.success) {
      onUpdate()
    } else {
      alert(`Failed to delete rule: ${result.message}`)
    }
  }

  const handleToggle = async (ruleId: string) => {
    setTogglingId(ruleId)
    const result = await toggleRuleEnabled(accountId, ruleId)
    setTogglingId(null)

    if (result.success) {
      onUpdate()
    } else {
      alert(`Failed to toggle rule: ${result.message}`)
    }
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
        default:
          return 'Unknown action'
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
          onClick={() => setShowCreateForm(true)}
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
                      disabled={togglingId === rule.id}
                      className={`rounded px-3 py-1 text-sm font-medium ${
                        rule.enabled
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-200 text-gray-600'
                      } hover:opacity-80 disabled:opacity-50`}
                    >
                      {togglingId === rule.id
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
                        onClick={() => setEditingRule(rule)}
                        className="rounded bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        disabled={deletingId === rule.id}
                        className="rounded bg-red-500 px-3 py-1 text-sm text-white hover:bg-red-600 disabled:opacity-50"
                      >
                        {deletingId === rule.id ? '...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Form Dialog */}
      {showCreateForm && (
        <RuleForm
          accountId={accountId}
          onClose={() => setShowCreateForm(false)}
          onSuccess={onUpdate}
        />
      )}

      {editingRule && (
        <RuleForm
          accountId={accountId}
          rule={editingRule}
          onClose={() => setEditingRule(null)}
          onSuccess={onUpdate}
        />
      )}
    </div>
  )
}
