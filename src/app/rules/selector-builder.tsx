'use client'

import type { SelectorExpression } from '@/lib/db/types'
import {
  TextInput,
  NumberInput,
  DateInput,
  Select,
  Checkbox,
} from '@/app/components/inputs'

interface SelectorBuilderProps {
  selector: SelectorExpression
  onChange: (selector: SelectorExpression) => void
  onRemove?: () => void
  depth?: number
}

export function SelectorBuilder({
  selector,
  onChange,
  onRemove,
  depth = 0,
}: SelectorBuilderProps) {
  const handleTypeChange = (newType: string) => {
    const recursiveTypes = ['and', 'or', 'not']
    const isCurrentRecursive = recursiveTypes.includes(selector.type)

    // Case 1: Swapping between AND and OR - preserve conditions
    if (
      (selector.type === 'and' || selector.type === 'or') &&
      (newType === 'and' || newType === 'or')
    ) {
      onChange({ ...selector, type: newType })
      return
    }

    // Case 2: Non-recursive → AND or OR - wrap current selector
    if (!isCurrentRecursive && (newType === 'and' || newType === 'or')) {
      onChange({
        type: newType,
        conditions: [selector],
      })
      return
    }

    // Case 3: Non-recursive → NOT - wrap current selector
    if (!isCurrentRecursive && newType === 'not') {
      onChange({
        type: 'not',
        condition: selector,
      })
      return
    }

    // Default: create new default selector based on type
    let newSelector: SelectorExpression
    switch (newType) {
      case 'account':
        newSelector = { type: 'account', pattern: '', matchType: 'exact' }
        break
      case 'narration':
        newSelector = {
          type: 'narration',
          pattern: '',
          matchType: 'substring',
        }
        break
      case 'payee':
        newSelector = { type: 'payee', pattern: '', matchType: 'substring' }
        break
      case 'amount':
        newSelector = { type: 'amount' }
        break
      case 'date':
        newSelector = { type: 'date' }
        break
      case 'flag':
        newSelector = { type: 'flag', flag: '*' }
        break
      case 'tag':
        newSelector = { type: 'tag', tag: '' }
        break
      case 'never':
        newSelector = { type: 'never' }
        break
      case 'and':
        newSelector = {
          type: 'and',
          conditions: [
            { type: 'narration', pattern: '', matchType: 'substring' },
          ],
        }
        break
      case 'or':
        newSelector = {
          type: 'or',
          conditions: [
            { type: 'narration', pattern: '', matchType: 'substring' },
          ],
        }
        break
      case 'not':
        newSelector = {
          type: 'not',
          condition: { type: 'narration', pattern: '', matchType: 'substring' },
        }
        break
      default:
        newSelector = { type: 'narration', pattern: '', matchType: 'substring' }
    }
    onChange(newSelector)
  }

  const renderSelectorInputs = () => {
    switch (selector.type) {
      case 'account':
        return (
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium">Match Type</label>
              <Select
                value={selector.matchType}
                onChange={(e) =>
                  onChange({
                    ...selector,
                    matchType: e.target.value as 'exact' | 'glob' | 'regex',
                  })
                }
              >
                <option value="exact">Exact</option>
                <option value="glob">Glob (wildcard)</option>
                <option value="regex">Regular Expression</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Pattern</label>
              <TextInput
                value={selector.pattern}
                onChange={(e) =>
                  onChange({ ...selector, pattern: e.target.value })
                }
                placeholder="e.g., Assets:Bank:Checking"
              />
            </div>
          </div>
        )

      case 'narration':
      case 'payee':
        return (
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium">Match Type</label>
              <Select
                value={selector.matchType}
                onChange={(e) =>
                  onChange({
                    ...selector,
                    matchType: e.target.value as
                      | 'exact'
                      | 'substring'
                      | 'regex',
                  })
                }
              >
                <option value="exact">Exact</option>
                <option value="substring">Contains (substring)</option>
                <option value="regex">Regular Expression</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Pattern</label>
              <TextInput
                value={selector.pattern}
                onChange={(e) =>
                  onChange({ ...selector, pattern: e.target.value })
                }
                placeholder={`e.g., ${selector.type === 'narration' ? 'Coffee Shop' : 'Starbucks'}`}
              />
            </div>
            <Checkbox
              label="Case Sensitive"
              checked={selector.caseSensitive ?? false}
              onChange={(e) =>
                onChange({ ...selector, caseSensitive: e.target.checked })
              }
            />
          </div>
        )

      case 'amount':
        return (
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium">Minimum Amount</label>
              <NumberInput
                step="0.01"
                value={selector.min ?? ''}
                onChange={(e) =>
                  onChange({
                    ...selector,
                    min: e.target.value
                      ? parseFloat(e.target.value)
                      : undefined,
                  })
                }
                placeholder="e.g., 10.00"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Maximum Amount</label>
              <NumberInput
                step="0.01"
                value={selector.max ?? ''}
                onChange={(e) =>
                  onChange({
                    ...selector,
                    max: e.target.value
                      ? parseFloat(e.target.value)
                      : undefined,
                  })
                }
                placeholder="e.g., 100.00"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Currency</label>
              <TextInput
                value={selector.currency ?? ''}
                onChange={(e) =>
                  onChange({
                    ...selector,
                    currency: e.target.value || undefined,
                  })
                }
                placeholder="e.g., USD"
              />
            </div>
          </div>
        )

      case 'date':
        return (
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium">After Date</label>
              <DateInput
                value={selector.after ?? ''}
                onChange={(e) =>
                  onChange({
                    ...selector,
                    after: e.target.value || undefined,
                  })
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">Before Date</label>
              <DateInput
                value={selector.before ?? ''}
                onChange={(e) =>
                  onChange({
                    ...selector,
                    before: e.target.value || undefined,
                  })
                }
              />
            </div>
          </div>
        )

      case 'flag':
        return (
          <div>
            <label className="text-sm font-medium">Flag Character</label>
            <TextInput
              maxLength={1}
              value={selector.flag}
              onChange={(e) => onChange({ ...selector, flag: e.target.value })}
              placeholder="e.g., * or !"
            />
          </div>
        )

      case 'tag':
        return (
          <div>
            <label className="text-sm font-medium">Tag</label>
            <TextInput
              value={selector.tag}
              onChange={(e) => onChange({ ...selector, tag: e.target.value })}
              placeholder="e.g., vacation"
            />
          </div>
        )

      case 'never':
        return (
          <div className="text-sm text-gray-500">
            This selector never matches any transaction. Use it for rules that
            should only be applied manually.
          </div>
        )

      case 'and':
      case 'or':
        return (
          <div className="space-y-2">
            <div className="text-sm font-medium">
              {selector.type.toUpperCase()} Conditions (all must match for AND,
              any for OR)
            </div>
            {selector.conditions.map((condition, index) => (
              <SelectorBuilder
                key={index}
                selector={condition}
                onChange={(newCondition) => {
                  const newConditions = [...selector.conditions]
                  newConditions[index] = newCondition
                  onChange({ ...selector, conditions: newConditions })
                }}
                onRemove={() => {
                  if (selector.conditions.length > 1) {
                    const newConditions = selector.conditions.filter(
                      (_, i) => i !== index,
                    )
                    onChange({ ...selector, conditions: newConditions })
                  }
                }}
                depth={depth + 1}
              />
            ))}
            <button
              type="button"
              onClick={() => {
                onChange({
                  ...selector,
                  conditions: [
                    ...selector.conditions,
                    { type: 'narration', pattern: '', matchType: 'substring' },
                  ],
                })
              }}
              className="rounded bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600"
            >
              + Add {selector.type.toUpperCase()} Condition
            </button>
          </div>
        )

      case 'not':
        return (
          <div className="space-y-2">
            <div className="text-sm font-medium">
              NOT Condition (negates the result)
            </div>
            <SelectorBuilder
              selector={selector.condition}
              onChange={(newCondition) =>
                onChange({ ...selector, condition: newCondition })
              }
              depth={depth + 1}
            />
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div
      className="rounded border border-gray-300 bg-white p-4"
      style={{ marginLeft: `${depth * 16}px` }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex-1">
          <label className="text-sm font-medium">Selector Type</label>
          <Select
            value={selector.type}
            onChange={(e) => handleTypeChange(e.target.value)}
          >
            <optgroup label="Basic Selectors">
              <option value="account">Account</option>
              <option value="narration">Narration</option>
              <option value="payee">Payee</option>
              <option value="amount">Amount</option>
              <option value="date">Date</option>
              <option value="flag">Flag</option>
              <option value="tag">Tag</option>
            </optgroup>
            <optgroup label="Special">
              <option value="never">Never Match (manual only)</option>
            </optgroup>
            <optgroup label="Logical Operators">
              <option value="and">AND (all conditions)</option>
              <option value="or">OR (any condition)</option>
              <option value="not">NOT (negate)</option>
            </optgroup>
          </Select>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-2 rounded bg-red-500 px-3 py-2 text-sm text-white hover:bg-red-600"
          >
            Remove
          </button>
        )}
      </div>
      {renderSelectorInputs()}
    </div>
  )
}
