'use client'

import type { Action } from '@/lib/db/types'

interface ActionBuilderProps {
  actions: Action[]
  onChange: (actions: Action[]) => void
}

export function ActionBuilder({ actions, onChange }: ActionBuilderProps) {
  const addAction = (type: Action['type']) => {
    let newAction: Action
    switch (type) {
      case 'modify_narration':
        newAction = {
          type: 'modify_narration',
          operation: 'replace',
          value: '',
        }
        break
      case 'modify_payee':
        newAction = {
          type: 'modify_payee',
          operation: 'replace',
          value: '',
        }
        break
      case 'add_posting':
        newAction = {
          type: 'add_posting',
          account: '',
        }
        break
      case 'modify_posting':
        newAction = {
          type: 'modify_posting',
          selector: {},
        }
        break
      case 'add_metadata':
        newAction = {
          type: 'add_metadata',
          key: '',
          value: '',
        }
        break
      case 'add_tag':
        newAction = {
          type: 'add_tag',
          tag: '',
        }
        break
      case 'add_link':
        newAction = {
          type: 'add_link',
          link: '',
        }
        break
      case 'add_comment':
        newAction = {
          type: 'add_comment',
          comment: '',
          position: 'before',
        }
        break
      case 'set_flag':
        newAction = {
          type: 'set_flag',
          flag: '*',
        }
        break
    }
    onChange([...actions, newAction])
  }

  const updateAction = (index: number, action: Action) => {
    const newActions = [...actions]
    newActions[index] = action
    onChange(newActions)
  }

  const removeAction = (index: number) => {
    onChange(actions.filter((_, i) => i !== index))
  }

  const moveAction = (index: number, direction: 'up' | 'down') => {
    const newActions = [...actions]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= actions.length) return
    ;[newActions[index], newActions[targetIndex]] = [
      newActions[targetIndex],
      newActions[index],
    ]
    onChange(newActions)
  }

  const renderActionInputs = (action: Action, index: number) => {
    switch (action.type) {
      case 'modify_narration':
        return (
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium">Operation</label>
              <select
                value={action.operation}
                onChange={(e) =>
                  updateAction(index, {
                    ...action,
                    operation: e.target.value as
                      | 'replace'
                      | 'prepend'
                      | 'append'
                      | 'regex_replace',
                  })
                }
                className="w-full rounded border border-gray-300 px-3 py-2"
              >
                <option value="replace">Replace</option>
                <option value="prepend">Prepend</option>
                <option value="append">Append</option>
                <option value="regex_replace">Regex Replace</option>
              </select>
            </div>
            {action.operation === 'regex_replace' && (
              <div>
                <label className="text-sm font-medium">Pattern (regex)</label>
                <input
                  type="text"
                  value={action.pattern ?? ''}
                  onChange={(e) =>
                    updateAction(index, {
                      ...action,
                      pattern: e.target.value,
                    })
                  }
                  placeholder="e.g., Coffee.*"
                  className="w-full rounded border border-gray-300 px-3 py-2"
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Value</label>
              <input
                type="text"
                value={action.value}
                onChange={(e) =>
                  updateAction(index, { ...action, value: e.target.value })
                }
                placeholder={
                  action.operation === 'replace'
                    ? 'New narration'
                    : action.operation === 'prepend'
                      ? 'Text to prepend'
                      : action.operation === 'append'
                        ? 'Text to append'
                        : 'Replacement text'
                }
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
          </div>
        )

      case 'modify_payee':
        return (
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium">Operation</label>
              <select
                value={action.operation}
                onChange={(e) =>
                  updateAction(index, {
                    ...action,
                    operation: e.target.value as 'replace' | 'set_if_empty',
                  })
                }
                className="w-full rounded border border-gray-300 px-3 py-2"
              >
                <option value="replace">Replace</option>
                <option value="set_if_empty">Set if Empty</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Payee</label>
              <input
                type="text"
                value={action.value}
                onChange={(e) =>
                  updateAction(index, { ...action, value: e.target.value })
                }
                placeholder="e.g., Starbucks"
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
          </div>
        )

      case 'add_posting':
        return (
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium">Account</label>
              <input
                type="text"
                value={action.account}
                onChange={(e) =>
                  updateAction(index, { ...action, account: e.target.value })
                }
                placeholder="e.g., Expenses:Food:Coffee"
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
            <div className="rounded border border-gray-200 p-3">
              <label className="mb-2 block text-sm font-medium">
                Amount (optional)
              </label>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-600">Value</label>
                  <input
                    type="text"
                    value={
                      action.amount?.value === 'auto'
                        ? 'auto'
                        : (action.amount?.value ?? '')
                    }
                    onChange={(e) => {
                      const value = e.target.value
                      updateAction(index, {
                        ...action,
                        amount:
                          value === ''
                            ? undefined
                            : {
                                value:
                                  value === 'auto'
                                    ? 'auto'
                                    : parseFloat(value) || 0,
                                currency: action.amount?.currency ?? 'USD',
                              },
                      })
                    }}
                    placeholder="auto or number (e.g., 5.00)"
                    className="w-full rounded border border-gray-300 px-3 py-2"
                  />
                </div>
                {action.amount && (
                  <div>
                    <label className="text-xs text-gray-600">Currency</label>
                    <input
                      type="text"
                      value={action.amount.currency}
                      onChange={(e) =>
                        updateAction(index, {
                          ...action,
                          amount: action.amount
                            ? { ...action.amount, currency: e.target.value }
                            : undefined,
                        })
                      }
                      placeholder="USD"
                      className="w-full rounded border border-gray-300 px-3 py-2"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )

      case 'modify_posting':
        return (
          <div className="space-y-2">
            <div className="rounded border border-gray-200 p-3">
              <label className="mb-2 block text-sm font-medium">Selector</label>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-600">
                    Account Pattern (optional)
                  </label>
                  <input
                    type="text"
                    value={action.selector.accountPattern ?? ''}
                    onChange={(e) =>
                      updateAction(index, {
                        ...action,
                        selector: {
                          ...action.selector,
                          accountPattern: e.target.value || undefined,
                        },
                      })
                    }
                    placeholder="e.g., Expenses:*"
                    className="w-full rounded border border-gray-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">
                    Posting Index (optional)
                  </label>
                  <input
                    type="number"
                    value={action.selector.index ?? ''}
                    onChange={(e) =>
                      updateAction(index, {
                        ...action,
                        selector: {
                          ...action.selector,
                          index: e.target.value
                            ? parseInt(e.target.value)
                            : undefined,
                        },
                      })
                    }
                    placeholder="0"
                    className="w-full rounded border border-gray-300 px-3 py-2"
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">
                New Account (optional)
              </label>
              <input
                type="text"
                value={action.newAccount ?? ''}
                onChange={(e) =>
                  updateAction(index, {
                    ...action,
                    newAccount: e.target.value || undefined,
                  })
                }
                placeholder="e.g., Expenses:Shopping"
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
            <div className="rounded border border-gray-200 p-3">
              <label className="mb-2 block text-sm font-medium">
                New Amount (optional)
              </label>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-600">Value</label>
                  <input
                    type="number"
                    step="0.01"
                    value={action.newAmount?.value ?? ''}
                    onChange={(e) =>
                      updateAction(index, {
                        ...action,
                        newAmount: e.target.value
                          ? {
                              value: parseFloat(e.target.value),
                              currency: action.newAmount?.currency ?? 'USD',
                            }
                          : undefined,
                      })
                    }
                    placeholder="10.00"
                    className="w-full rounded border border-gray-300 px-3 py-2"
                  />
                </div>
                {action.newAmount && (
                  <div>
                    <label className="text-xs text-gray-600">Currency</label>
                    <input
                      type="text"
                      value={action.newAmount.currency}
                      onChange={(e) =>
                        updateAction(index, {
                          ...action,
                          newAmount: action.newAmount
                            ? { ...action.newAmount, currency: e.target.value }
                            : undefined,
                        })
                      }
                      placeholder="USD"
                      className="w-full rounded border border-gray-300 px-3 py-2"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )

      case 'add_metadata':
        return (
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium">Key</label>
              <input
                type="text"
                value={action.key}
                onChange={(e) =>
                  updateAction(index, { ...action, key: e.target.value })
                }
                placeholder="e.g., receipt-id"
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Value</label>
              <input
                type="text"
                value={String(action.value)}
                onChange={(e) => {
                  // Try to parse as number or boolean, otherwise string
                  let value: string | number | boolean = e.target.value
                  if (value === 'true') value = true
                  else if (value === 'false') value = false
                  else if (!isNaN(Number(value)) && value !== '')
                    value = Number(value)
                  updateAction(index, { ...action, value })
                }}
                placeholder="Value (string, number, or true/false)"
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={action.overwrite ?? false}
                  onChange={(e) =>
                    updateAction(index, {
                      ...action,
                      overwrite: e.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium">Overwrite if exists</span>
              </label>
            </div>
          </div>
        )

      case 'add_tag':
        return (
          <div>
            <label className="text-sm font-medium">Tag</label>
            <input
              type="text"
              value={action.tag}
              onChange={(e) =>
                updateAction(index, { ...action, tag: e.target.value })
              }
              placeholder="e.g., vacation"
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
        )

      case 'add_link':
        return (
          <div>
            <label className="text-sm font-medium">Link</label>
            <input
              type="text"
              value={action.link}
              onChange={(e) =>
                updateAction(index, { ...action, link: e.target.value })
              }
              placeholder="e.g., ^invoice-123"
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
        )

      case 'add_comment':
        return (
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium">Position</label>
              <select
                value={action.position}
                onChange={(e) =>
                  updateAction(index, {
                    ...action,
                    position: e.target.value as 'before' | 'after',
                  })
                }
                className="w-full rounded border border-gray-300 px-3 py-2"
              >
                <option value="before">Before Transaction</option>
                <option value="after">After Transaction</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Comment</label>
              <textarea
                value={action.comment}
                onChange={(e) =>
                  updateAction(index, { ...action, comment: e.target.value })
                }
                placeholder="Comment text..."
                rows={3}
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
          </div>
        )

      case 'set_flag':
        return (
          <div>
            <label className="text-sm font-medium">Flag Character</label>
            <input
              type="text"
              maxLength={1}
              value={action.flag}
              onChange={(e) =>
                updateAction(index, { ...action, flag: e.target.value })
              }
              placeholder="e.g., * or !"
              className="w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Actions</h3>
        <div className="relative">
          <select
            onChange={(e) => {
              if (e.target.value) {
                addAction(e.target.value as Action['type'])
                e.target.value = ''
              }
            }}
            className="rounded bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600"
          >
            <option value="">+ Add Action</option>
            <option value="modify_narration">Modify Narration</option>
            <option value="modify_payee">Modify Payee</option>
            <option value="add_posting">Add Posting</option>
            <option value="modify_posting">Modify Posting</option>
            <option value="add_metadata">Add Metadata</option>
            <option value="add_tag">Add Tag</option>
            <option value="add_link">Add Link</option>
            <option value="add_comment">Add Comment</option>
            <option value="set_flag">Set Flag</option>
          </select>
        </div>
      </div>

      {actions.length === 0 && (
        <p className="text-sm text-gray-500">
          No actions yet. Add an action to define what happens when a
          transaction matches.
        </p>
      )}

      {actions.map((action, index) => (
        <div
          key={index}
          className="rounded border border-gray-300 bg-gray-50 p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="font-medium">
              {index + 1}.{' '}
              {action.type
                .split('_')
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ')}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => moveAction(index, 'up')}
                disabled={index === 0}
                className="rounded bg-gray-300 px-2 py-1 text-xs hover:bg-gray-400 disabled:opacity-50"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveAction(index, 'down')}
                disabled={index === actions.length - 1}
                className="rounded bg-gray-300 px-2 py-1 text-xs hover:bg-gray-400 disabled:opacity-50"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeAction(index)}
                className="rounded bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600"
              >
                Remove
              </button>
            </div>
          </div>
          {renderActionInputs(action, index)}
        </div>
      ))}
    </div>
  )
}
