'use client'

import { useState } from 'react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import type { Action, ActionTarget } from '@/lib/db/types'
import {
  TextInputWithVariableHelp,
  FULL_TEXT_VARIABLES,
  AMOUNT_VALUE_VARIABLES,
  CURRENCY_VARIABLES,
  type Variable,
} from '../components/textInputWithVariableHelp'
import {
  TextInput,
  NumberInput,
  Select,
  Checkbox,
} from '@/app/components/inputs'

interface ActionBuilderProps {
  actions: Action[]
  onChange: (actions: Action[]) => void
  userVariables?: Variable[]
}

interface PostingValue {
  account: string
  amount?: { value: string; currency: string }
}

/**
 * Account + amount + currency inputs for a single posting.
 * Shared by the `add_posting` action and the postings list of `add_transaction`.
 */
function PostingFields({
  posting,
  onChange,
  userVariables = [],
}: {
  posting: PostingValue
  onChange: (posting: PostingValue) => void
  userVariables?: Variable[]
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-sm font-medium">Account</label>
        <TextInputWithVariableHelp
          value={posting.account}
          onChange={(e) => onChange({ ...posting, account: e.target.value })}
          placeholder="e.g., Expenses:Food:Coffee"
          className="w-full rounded border border-gray-300 px-3 py-2"
          variables={FULL_TEXT_VARIABLES}
          userVariables={userVariables}
        />
      </div>
      <div className="rounded border border-gray-200 p-3">
        <label className="mb-2 block text-sm font-medium">
          Amount (optional)
        </label>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-gray-600">Value</label>
            <TextInputWithVariableHelp
              value={posting.amount?.value ?? ''}
              onChange={(e) => {
                const value = e.target.value
                onChange({
                  ...posting,
                  amount:
                    value === ''
                      ? undefined
                      : {
                          value,
                          currency:
                            posting.amount?.currency ?? '$postingCurrency[0]',
                        },
                })
              }}
              placeholder="auto or number (e.g., 5.00)"
              className="w-full rounded border border-gray-300 px-3 py-2"
              variables={AMOUNT_VALUE_VARIABLES}
              userVariables={userVariables}
            />
          </div>
          {posting.amount && (
            <div>
              <label className="text-xs text-gray-600">Currency</label>
              <TextInputWithVariableHelp
                value={posting.amount.currency}
                onChange={(e) =>
                  onChange({
                    ...posting,
                    amount: posting.amount
                      ? { ...posting.amount, currency: e.target.value }
                      : undefined,
                  })
                }
                placeholder="Defaults to $postingCurrency[0]"
                className="w-full rounded border border-gray-300 px-3 py-2"
                variables={CURRENCY_VARIABLES}
                userVariables={userVariables}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Editable list of plain strings (used for the tags and links of a new transaction).
 */
function StringListField({
  label,
  addLabel,
  placeholder,
  items,
  onChange,
  userVariables = [],
}: {
  label: string
  addLabel: string
  placeholder: string
  items: string[]
  onChange: (items: string[]) => void
  userVariables?: Variable[]
}) {
  return (
    <div className="rounded border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <button
          type="button"
          onClick={() => onChange([...items, ''])}
          className="rounded bg-gray-300 px-2 py-1 text-xs hover:bg-gray-400"
        >
          {addLabel}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-gray-500">None</p>
      ) : (
        <div className="space-y-2">
          {items.map((item, itemIndex) => (
            <div key={itemIndex} className="flex items-start gap-2">
              <div className="flex-1">
                <TextInputWithVariableHelp
                  value={item}
                  onChange={(e) =>
                    onChange(
                      items.map((existing, i) =>
                        i === itemIndex ? e.target.value : existing,
                      ),
                    )
                  }
                  placeholder={placeholder}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  variables={FULL_TEXT_VARIABLES}
                  userVariables={userVariables}
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  onChange(items.filter((_, i) => i !== itemIndex))
                }
                className="rounded bg-red-500 px-2 py-2 text-xs text-white hover:bg-red-600"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Human readable description of an action target, used in the collapsed header.
 */
function describeTarget(target: ActionTarget): string {
  switch (target.mode) {
    case 'all':
      return 'All transactions'
    case 'first':
      return 'First transaction'
    case 'last':
      return 'Last transaction'
    case 'index':
      return `Transaction #${target.index ?? 0}`
  }
}

/**
 * Collapsed "Advanced" section shown for every action.
 *
 * Holds the target: which transaction(s) the action runs on once an earlier
 * action in the chain (currently only `add_transaction`) has produced more than
 * one transaction.
 */
function ActionAdvancedFields({
  target,
  onChange,
  actionIndex,
}: {
  target?: ActionTarget
  onChange: (target: ActionTarget | undefined) => void
  actionIndex: number
}) {
  // Open on load when a non-default target is configured, so it is not hidden
  const [isExpanded, setIsExpanded] = useState(
    target !== undefined && target.mode !== 'all',
  )
  const contentId = `action-advanced-${actionIndex}`

  return (
    <div className="mt-3 border-t border-gray-200 pt-2">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
        aria-expanded={isExpanded}
        aria-controls={contentId}
      >
        <ChevronDownIcon
          className={`h-4 w-4 transform transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
        Advanced
      </button>

      {isExpanded && (
        <div id={contentId} className="mt-2 space-y-2">
          <p className="text-xs text-gray-500">
            Which transaction this action runs on. Only relevant when an earlier
            action added a transaction - otherwise there is just one.
          </p>
          <div>
            <label className="text-sm font-medium">Apply to</label>
            <Select
              value={target?.mode ?? 'all'}
              onChange={(e) => {
                const mode = e.target.value as ActionTarget['mode']
                // Drop the field entirely for the default so rules stay clean
                onChange(
                  mode === 'all'
                    ? undefined
                    : { mode, index: mode === 'index' ? 0 : undefined },
                )
              }}
            >
              <option value="all">All transactions</option>
              <option value="first">First transaction</option>
              <option value="last">Last transaction</option>
              <option value="index">Specific transaction</option>
            </Select>
          </div>
          {target?.mode === 'index' && (
            <div>
              <label className="text-xs text-gray-600">
                Transaction index (0-based)
              </label>
              <NumberInput
                value={target.index ?? 0}
                onChange={(e) =>
                  onChange({
                    mode: 'index',
                    index: e.target.value ? parseInt(e.target.value) : 0,
                  })
                }
                placeholder="0"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Parses a metadata input into the string/number/boolean union the schema allows.
 * Mirrors the coercion used by the `add_metadata` action.
 */
function parseMetadataValue(raw: string): string | number | boolean {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw !== '' && !isNaN(Number(raw))) return Number(raw)
  return raw
}

export function ActionBuilder({
  actions,
  onChange,
  userVariables = [],
}: ActionBuilderProps) {
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
          amount: {
            value: '$negatedPostingAmount[0]',
            currency: '$postingCurrency[0]',
          },
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
      case 'set_output_file':
        newAction = {
          type: 'set_output_file',
          outputFile: '',
          keepCommentedCopy: false,
        }
        break
      case 'comment_out_transaction':
        newAction = {
          type: 'comment_out_transaction',
        }
        break
      case 'add_transaction':
        newAction = {
          type: 'add_transaction',
          position: 'after',
          date: '',
          flag: '*',
          payee: '',
          narration: '',
          postings: [],
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
              <Select
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
              >
                <option value="replace">Replace</option>
                <option value="prepend">Prepend</option>
                <option value="append">Append</option>
                <option value="regex_replace">Regex Replace</option>
              </Select>
            </div>
            {action.operation === 'regex_replace' && (
              <div>
                <label className="text-sm font-medium">Pattern (regex)</label>
                <TextInput
                  value={action.pattern ?? ''}
                  onChange={(e) =>
                    updateAction(index, {
                      ...action,
                      pattern: e.target.value,
                    })
                  }
                  placeholder="e.g., Coffee.*"
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Value</label>
              <TextInputWithVariableHelp
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
                variables={FULL_TEXT_VARIABLES}
                userVariables={userVariables}
              />
            </div>
          </div>
        )

      case 'modify_payee':
        return (
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium">Operation</label>
              <Select
                value={action.operation}
                onChange={(e) =>
                  updateAction(index, {
                    ...action,
                    operation: e.target.value as 'replace' | 'set_if_empty',
                  })
                }
              >
                <option value="replace">Replace</option>
                <option value="set_if_empty">Set if Empty</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Payee</label>
              <TextInputWithVariableHelp
                value={action.value}
                onChange={(e) =>
                  updateAction(index, { ...action, value: e.target.value })
                }
                placeholder="e.g., Starbucks"
                className="w-full rounded border border-gray-300 px-3 py-2"
                variables={FULL_TEXT_VARIABLES}
                userVariables={userVariables}
              />
            </div>
          </div>
        )

      case 'add_posting':
        return (
          <PostingFields
            posting={action}
            onChange={(posting) =>
              updateAction(index, { ...action, ...posting })
            }
            userVariables={userVariables}
          />
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
                  <TextInput
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
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">
                    Posting Index (optional)
                  </label>
                  <NumberInput
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
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">
                New Account (optional)
              </label>
              <TextInputWithVariableHelp
                value={action.newAccount ?? ''}
                onChange={(e) =>
                  updateAction(index, {
                    ...action,
                    newAccount: e.target.value || undefined,
                  })
                }
                placeholder="e.g., Expenses:Shopping"
                className="w-full rounded border border-gray-300 px-3 py-2"
                variables={FULL_TEXT_VARIABLES}
                userVariables={userVariables}
              />
            </div>
            <div className="rounded border border-gray-200 p-3">
              <label className="mb-2 block text-sm font-medium">
                New Amount (optional)
              </label>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-600">Value</label>
                  <TextInputWithVariableHelp
                    value={action.newAmount?.value ?? ''}
                    onChange={(e) =>
                      updateAction(index, {
                        ...action,
                        newAmount: e.target.value
                          ? {
                              value: e.target.value,
                              currency:
                                action.newAmount?.currency ??
                                '$postingCurrency[0]',
                            }
                          : undefined,
                      })
                    }
                    placeholder="10.00"
                    className="w-full rounded border border-gray-300 px-3 py-2"
                    variables={AMOUNT_VALUE_VARIABLES}
                    userVariables={userVariables}
                  />
                </div>
                {action.newAmount && (
                  <div>
                    <label className="text-xs text-gray-600">Currency</label>
                    <TextInputWithVariableHelp
                      value={action.newAmount.currency}
                      onChange={(e) =>
                        updateAction(index, {
                          ...action,
                          newAmount: action.newAmount
                            ? { ...action.newAmount, currency: e.target.value }
                            : undefined,
                        })
                      }
                      placeholder="Defaults to $postingCurrency[0]"
                      className="w-full rounded border border-gray-300 px-3 py-2"
                      variables={CURRENCY_VARIABLES}
                      userVariables={userVariables}
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
              <TextInput
                value={action.key}
                onChange={(e) =>
                  updateAction(index, { ...action, key: e.target.value })
                }
                placeholder="e.g., receipt-id"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Value</label>
              <TextInputWithVariableHelp
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
                variables={FULL_TEXT_VARIABLES}
                userVariables={userVariables}
              />
            </div>
            <Checkbox
              label="Overwrite if exists"
              checked={action.overwrite ?? false}
              onChange={(e) =>
                updateAction(index, {
                  ...action,
                  overwrite: e.target.checked,
                })
              }
            />
          </div>
        )

      case 'add_tag':
        return (
          <div>
            <label className="text-sm font-medium">Tag</label>
            <TextInputWithVariableHelp
              value={action.tag}
              onChange={(e) =>
                updateAction(index, { ...action, tag: e.target.value })
              }
              placeholder="e.g., vacation"
              className="w-full rounded border border-gray-300 px-3 py-2"
              variables={FULL_TEXT_VARIABLES}
              userVariables={userVariables}
            />
          </div>
        )

      case 'add_link':
        return (
          <div>
            <label className="text-sm font-medium">Link</label>
            <TextInputWithVariableHelp
              value={action.link}
              onChange={(e) =>
                updateAction(index, { ...action, link: e.target.value })
              }
              placeholder="e.g., ^invoice-123"
              className="w-full rounded border border-gray-300 px-3 py-2"
              variables={FULL_TEXT_VARIABLES}
              userVariables={userVariables}
            />
          </div>
        )

      case 'add_comment':
        return (
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium">Position</label>
              <Select
                value={action.position}
                onChange={(e) =>
                  updateAction(index, {
                    ...action,
                    position: e.target.value as 'before' | 'after',
                  })
                }
              >
                <option value="before">Before Transaction</option>
                <option value="after">After Transaction</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Comment</label>
              <TextInputWithVariableHelp
                value={action.comment}
                onChange={(e) =>
                  updateAction(index, { ...action, comment: e.target.value })
                }
                placeholder="Comment text..."
                className="w-full rounded border border-gray-300 px-3 py-2"
                variables={FULL_TEXT_VARIABLES}
                userVariables={userVariables}
              />
            </div>
          </div>
        )

      case 'set_flag':
        return (
          <div>
            <label className="text-sm font-medium">Flag Character</label>
            <TextInput
              maxLength={1}
              value={action.flag}
              onChange={(e) =>
                updateAction(index, { ...action, flag: e.target.value })
              }
              placeholder="e.g., * or !"
            />
          </div>
        )

      case 'set_output_file':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Output File Path</label>
              <TextInputWithVariableHelp
                value={action.outputFile}
                onChange={(e) =>
                  updateAction(index, { ...action, outputFile: e.target.value })
                }
                placeholder="e.g., /path/to/output.beancount"
                className="w-full rounded border border-gray-300 px-3 py-2"
                variables={FULL_TEXT_VARIABLES}
                userVariables={userVariables}
              />
            </div>
            <Checkbox
              label="Keep commented copy in original file"
              checked={action.keepCommentedCopy ?? false}
              onChange={(e) =>
                updateAction(index, {
                  ...action,
                  keepCommentedCopy: e.target.checked,
                })
              }
            />
          </div>
        )

      case 'comment_out_transaction':
        return (
          <p className="text-sm text-gray-600">
            Comments out the entire transaction by prefixing each line with
            &quot;; &quot;.
          </p>
        )

      case 'add_transaction': {
        const metadataEntries = Object.entries(action.metadata ?? {})
        return (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              Writes an additional transaction to the same file as the matched
              transaction. Later actions and rules also apply to it.
            </p>
            <div>
              <label className="text-sm font-medium">Position</label>
              <Select
                value={action.position}
                onChange={(e) =>
                  updateAction(index, {
                    ...action,
                    position: e.target.value as 'before' | 'after',
                  })
                }
              >
                <option value="before">Before Transaction</option>
                <option value="after">After Transaction</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Date</label>
              <TextInputWithVariableHelp
                value={action.date ?? ''}
                onChange={(e) =>
                  updateAction(index, { ...action, date: e.target.value })
                }
                placeholder="Defaults to the matched transaction's date"
                className="w-full rounded border border-gray-300 px-3 py-2"
                variables={FULL_TEXT_VARIABLES}
                userVariables={userVariables}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Flag</label>
              <TextInput
                value={action.flag ?? ''}
                onChange={(e) =>
                  updateAction(index, { ...action, flag: e.target.value })
                }
                placeholder="Defaults to *"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Payee</label>
              <TextInputWithVariableHelp
                value={action.payee ?? ''}
                onChange={(e) =>
                  updateAction(index, { ...action, payee: e.target.value })
                }
                placeholder="e.g., Tax office"
                className="w-full rounded border border-gray-300 px-3 py-2"
                variables={FULL_TEXT_VARIABLES}
                userVariables={userVariables}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Narration</label>
              <TextInputWithVariableHelp
                value={action.narration ?? ''}
                onChange={(e) =>
                  updateAction(index, { ...action, narration: e.target.value })
                }
                placeholder="e.g., VAT on $narration"
                className="w-full rounded border border-gray-300 px-3 py-2"
                variables={FULL_TEXT_VARIABLES}
                userVariables={userVariables}
              />
            </div>
            <div className="rounded border border-gray-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium">Postings</label>
                <button
                  type="button"
                  onClick={() =>
                    updateAction(index, {
                      ...action,
                      postings: [...action.postings, { account: '' }],
                    })
                  }
                  className="rounded bg-gray-300 px-2 py-1 text-xs hover:bg-gray-400"
                >
                  + Add Posting
                </button>
              </div>
              {action.postings.length === 0 ? (
                <p className="text-xs text-gray-500">
                  No postings yet. A transaction needs at least two postings, or
                  one posting with no amount.
                </p>
              ) : (
                <div className="space-y-2">
                  {action.postings.map((posting, postingIndex) => (
                    <div
                      key={postingIndex}
                      className="rounded border border-gray-300 bg-white p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-600">
                          Posting {postingIndex + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateAction(index, {
                              ...action,
                              postings: action.postings.filter(
                                (_, i) => i !== postingIndex,
                              ),
                            })
                          }
                          className="rounded bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600"
                        >
                          Remove
                        </button>
                      </div>
                      <PostingFields
                        posting={posting}
                        onChange={(updated) =>
                          updateAction(index, {
                            ...action,
                            postings: action.postings.map((existing, i) =>
                              i === postingIndex ? updated : existing,
                            ),
                          })
                        }
                        userVariables={userVariables}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <StringListField
              label="Tags"
              addLabel="+ Add Tag"
              placeholder="e.g., vat"
              items={action.tags ?? []}
              onChange={(tags) => updateAction(index, { ...action, tags })}
              userVariables={userVariables}
            />
            <StringListField
              label="Links"
              addLabel="+ Add Link"
              placeholder="e.g., invoice-123"
              items={action.links ?? []}
              onChange={(links) => updateAction(index, { ...action, links })}
              userVariables={userVariables}
            />
            <div className="rounded border border-gray-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium">Metadata</label>
                <button
                  type="button"
                  onClick={() =>
                    updateAction(index, {
                      ...action,
                      metadata: Object.fromEntries([
                        ...metadataEntries,
                        ['', ''],
                      ]),
                    })
                  }
                  className="rounded bg-gray-300 px-2 py-1 text-xs hover:bg-gray-400"
                >
                  + Add Metadata
                </button>
              </div>
              {metadataEntries.length === 0 ? (
                <p className="text-xs text-gray-500">None</p>
              ) : (
                <div className="space-y-2">
                  {metadataEntries.map(([key, value], entryIndex) => (
                    <div key={entryIndex} className="flex items-start gap-2">
                      <div className="w-1/3">
                        <TextInput
                          value={key}
                          onChange={(e) =>
                            updateAction(index, {
                              ...action,
                              metadata: Object.fromEntries(
                                metadataEntries.map((entry, i) =>
                                  i === entryIndex
                                    ? [e.target.value, entry[1]]
                                    : entry,
                                ),
                              ),
                            })
                          }
                          placeholder="Key"
                        />
                      </div>
                      <div className="flex-1">
                        <TextInputWithVariableHelp
                          value={String(value)}
                          onChange={(e) =>
                            updateAction(index, {
                              ...action,
                              metadata: Object.fromEntries(
                                metadataEntries.map((entry, i) =>
                                  i === entryIndex
                                    ? [
                                        entry[0],
                                        parseMetadataValue(e.target.value),
                                      ]
                                    : entry,
                                ),
                              ),
                            })
                          }
                          placeholder="Value (string, number, or true/false)"
                          className="w-full rounded border border-gray-300 px-3 py-2"
                          variables={FULL_TEXT_VARIABLES}
                          userVariables={userVariables}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateAction(index, {
                            ...action,
                            metadata: Object.fromEntries(
                              metadataEntries.filter(
                                (_, i) => i !== entryIndex,
                              ),
                            ),
                          })
                        }
                        className="rounded bg-red-500 px-2 py-2 text-xs text-white hover:bg-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      }

      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Actions</h3>
        <Select
          onChange={(e) => {
            if (e.target.value) {
              addAction(e.target.value as Action['type'])
              e.target.value = ''
            }
          }}
          className="w-auto rounded border-none bg-blue-500 px-4 py-2 text-sm text-white shadow-none hover:bg-blue-600"
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
          <option value="set_output_file">Set Output File</option>
          <option value="comment_out_transaction">
            Comment Out Transaction
          </option>
          <option value="add_transaction">Add Transaction</option>
        </Select>
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
              {action.target && action.target.mode !== 'all' && (
                <span className="ml-2 text-xs font-normal text-gray-500">
                  → {describeTarget(action.target)}
                </span>
              )}
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
          <ActionAdvancedFields
            actionIndex={index}
            target={action.target}
            onChange={(target) => updateAction(index, { ...action, target })}
          />
        </div>
      ))}
    </div>
  )
}
