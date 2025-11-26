'use client'

import { useState, useActionState } from 'react'
import type { Rule, SelectorExpression, Action } from '@/lib/db/types'
import { SelectorBuilder } from './selector-builder'
import { ActionBuilder } from './action-builder'
import { createRule, updateRule } from './actions'

interface RuleFormProps {
  accountId: string
  rule?: Rule
  onClose: () => void
  onSuccess: () => void
}

export function RuleForm({
  accountId,
  rule,
  onClose,
  onSuccess,
}: RuleFormProps) {
  const isEditing = !!rule

  // Form state
  const [name, setName] = useState(rule?.name ?? '')
  const [description, setDescription] = useState(rule?.description ?? '')
  const [enabled, setEnabled] = useState(rule?.enabled ?? true)
  const [priority, setPriority] = useState(rule?.priority ?? 100)
  const [selector, setSelector] = useState<SelectorExpression>(
    rule?.selector ?? {
      type: 'narration',
      pattern: '',
      matchType: 'substring',
    },
  )
  const [actions, setActions] = useState<Action[]>(rule?.actions ?? [])
  const [showExpectations, setShowExpectations] = useState(!!rule?.expectations)
  const [minAmount, setMinAmount] = useState(
    rule?.expectations?.minAmount?.toString() ?? '',
  )
  const [maxAmount, setMaxAmount] = useState(
    rule?.expectations?.maxAmount?.toString() ?? '',
  )
  const [currency, setCurrency] = useState(rule?.expectations?.currency ?? '')

  // Server action handlers with FormData
  const [createState, createAction, isCreating] = useActionState(async () => {
    const newRule = {
      name,
      description: description || undefined,
      enabled,
      priority,
      selector,
      actions,
      expectations: showExpectations
        ? {
            minAmount: minAmount ? parseFloat(minAmount) : undefined,
            maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
            currency: currency || undefined,
          }
        : undefined,
    }

    const result = await createRule(accountId, newRule)
    if (result.success) {
      onSuccess()
      onClose()
    }
    return result
  }, null)

  const [updateState, updateAction, isUpdating] = useActionState(async () => {
    if (!rule) return { message: 'No rule to update', success: false }

    const updatedRule = {
      name,
      description: description || undefined,
      enabled,
      priority,
      selector,
      actions,
      expectations: showExpectations
        ? {
            minAmount: minAmount ? parseFloat(minAmount) : undefined,
            maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
            currency: currency || undefined,
          }
        : undefined,
    }

    const result = await updateRule(accountId, rule.id, updatedRule)
    if (result.success) {
      onSuccess()
      onClose()
    }
    return result
  }, null)

  const state = isEditing ? updateState : createState
  const isPending = isCreating || isUpdating

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            {isEditing ? 'Edit Rule' : 'Create New Rule'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <form
          action={isEditing ? updateAction : createAction}
          className="space-y-6"
        >
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Basic Information</h3>

            <div>
              <label className="block text-sm font-medium">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g., Coffee Purchase Rule"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description of what this rule does"
                rows={2}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium">
                  Priority <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
                  required
                  placeholder="100"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Higher priority rules run first
                </p>
              </div>

              <div className="flex items-end pb-7">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm font-medium">Enabled</span>
                </label>
              </div>
            </div>
          </div>

          {/* Selector */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Match Condition</h3>
            <p className="text-sm text-gray-600">
              Define when this rule should be applied
            </p>
            <SelectorBuilder selector={selector} onChange={setSelector} />
          </div>

          {/* Actions */}
          <div className="space-y-4">
            <ActionBuilder actions={actions} onChange={setActions} />
          </div>

          {/* Expectations (Optional) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">
                Expectations (Optional Validation)
              </h3>
              <button
                type="button"
                onClick={() => setShowExpectations(!showExpectations)}
                className="text-sm text-blue-500 hover:text-blue-600"
              >
                {showExpectations ? 'Hide' : 'Show'} Expectations
              </button>
            </div>

            {showExpectations && (
              <div className="space-y-3 rounded border border-gray-300 bg-gray-50 p-4">
                <p className="text-sm text-gray-600">
                  Set expectations to validate matched transactions and generate
                  warnings
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium">
                      Min Amount
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={minAmount}
                      onChange={(e) => setMinAmount(e.target.value)}
                      placeholder="e.g., 5.00"
                      className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">
                      Max Amount
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={maxAmount}
                      onChange={(e) => setMaxAmount(e.target.value)}
                      placeholder="e.g., 50.00"
                      className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium">Currency</label>
                  <input
                    type="text"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    placeholder="e.g., USD"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Error/Success Messages */}
          {state && !state.success && (
            <div className="rounded bg-red-50 p-3 text-sm text-red-700">
              {state.message}
            </div>
          )}

          {/* Form Actions */}
          <div className="flex justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !name || actions.length === 0}
              className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {isPending
                ? isEditing
                  ? 'Updating...'
                  : 'Creating...'
                : isEditing
                  ? 'Update Rule'
                  : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
