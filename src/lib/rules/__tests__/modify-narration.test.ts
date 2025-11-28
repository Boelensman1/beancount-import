/**
 * Tests for modify_narration action
 */
import { describe, it, expect } from 'vitest'
import { Value } from 'beancount'
import { applyAction } from '../engine'
import type { Action } from '@/lib/db/types'
import { createMockTransaction, createMockPosting } from '@/test/test-utils'

describe('modify_narration', () => {
  it('should replace narration', () => {
    const transaction = createMockTransaction({ narration: 'Old narration' })
    const action: Action = {
      type: 'modify_narration',
      operation: 'replace',
      value: 'New narration',
    }

    applyAction(transaction, action)

    expect(transaction.narration).toBe('New narration')
  })

  it('should prepend to narration', () => {
    const transaction = createMockTransaction({ narration: 'narration' })
    const action: Action = {
      type: 'modify_narration',
      operation: 'prepend',
      value: 'Prefix: ',
    }

    applyAction(transaction, action)

    expect(transaction.narration).toBe('Prefix: narration')
  })

  it('should append to narration', () => {
    const transaction = createMockTransaction({ narration: 'narration' })
    const action: Action = {
      type: 'modify_narration',
      operation: 'append',
      value: ' - suffix',
    }

    applyAction(transaction, action)

    expect(transaction.narration).toBe('narration - suffix')
  })

  it('should regex replace in narration', () => {
    const transaction = createMockTransaction({
      narration: 'Coffee at Starbucks #1234',
    })
    const action: Action = {
      type: 'modify_narration',
      operation: 'regex_replace',
      pattern: '#\\d+',
      value: '',
    }

    applyAction(transaction, action)

    expect(transaction.narration).toBe('Coffee at Starbucks ')
  })

  it('should replace all occurrences with regex', () => {
    const transaction = createMockTransaction({
      narration: 'foo bar foo baz',
    })
    const action: Action = {
      type: 'modify_narration',
      operation: 'regex_replace',
      pattern: 'foo',
      value: 'qux',
    }

    applyAction(transaction, action)

    expect(transaction.narration).toBe('qux bar qux baz')
  })

  it('should handle regex replace without pattern', () => {
    const transaction = createMockTransaction({ narration: 'Test' })
    const action: Action = {
      type: 'modify_narration',
      operation: 'regex_replace',
      value: 'Replacement',
    }

    applyAction(transaction, action)

    expect(transaction.narration).toBe('Test')
  })

  it('should handle invalid regex gracefully', () => {
    const transaction = createMockTransaction({ narration: 'Test' })
    const action: Action = {
      type: 'modify_narration',
      operation: 'regex_replace',
      pattern: '[invalid(',
      value: 'Replacement',
    }

    applyAction(transaction, action)

    expect(transaction.narration).toBe('Test')
  })

  it('should handle empty narration', () => {
    const transaction = createMockTransaction({ narration: '' })
    const action: Action = {
      type: 'modify_narration',
      operation: 'prepend',
      value: 'New: ',
    }

    applyAction(transaction, action)

    expect(transaction.narration).toBe('New: ')
  })

  describe('variable replacement', () => {
    it('should replace variables in replace operation', () => {
      const transaction = createMockTransaction({
        payee: 'John Doe',
      })
      const action: Action = {
        type: 'modify_narration',
        operation: 'replace',
        value: 'Payment from $payee',
      }

      applyAction(transaction, action)

      expect(transaction.narration).toBe('Payment from John Doe')
    })

    it('should replace variables in prepend operation', () => {
      const transaction = createMockTransaction({
        narration: 'Original',
        date: '2024-01-15',
      })
      const action: Action = {
        type: 'modify_narration',
        operation: 'prepend',
        value: '[$date] ',
      }

      applyAction(transaction, action)

      expect(transaction.narration).toBe('[2024-01-15] Original')
    })

    it('should replace variables in append operation', () => {
      const transaction = createMockTransaction({
        narration: 'Grocery',
        postings: [createMockPosting({ account: 'Expenses:Food' })],
      })
      const action: Action = {
        type: 'modify_narration',
        operation: 'append',
        value: ' - Account: $postingAccount[0]',
      }

      applyAction(transaction, action)

      expect(transaction.narration).toBe('Grocery - Account: Expenses:Food')
    })

    it('should replace variables in regex_replace operation', () => {
      const transaction = createMockTransaction({
        narration: 'Transaction #1234',
        postings: [createMockPosting({ amount: '100.00', currency: 'USD' })],
      })
      const action: Action = {
        type: 'modify_narration',
        operation: 'regex_replace',
        pattern: '#\\d+',
        value: 'Amount: $postingAmount[0] $postingCurrency[0]',
      }

      applyAction(transaction, action)

      expect(transaction.narration).toBe('Transaction Amount: 100.00 USD')
    })

    it('should replace multiple variables in single value', () => {
      const transaction = createMockTransaction({
        payee: 'Amazon',
        postings: [createMockPosting({ amount: '29.99', currency: 'USD' })],
      })
      const action: Action = {
        type: 'modify_narration',
        operation: 'replace',
        value: '$payee paid $postingAmount[0] $postingCurrency[0]',
      }

      applyAction(transaction, action)

      expect(transaction.narration).toBe('Amazon paid 29.99 USD')
    })

    it('should replace array-indexed variables from multiple postings', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ amount: '100.00' }),
          createMockPosting({ amount: '-100.00' }),
        ],
      })
      const action: Action = {
        type: 'modify_narration',
        operation: 'replace',
        value: 'Split: $postingAmount[0] / $postingAmount[1]',
      }

      applyAction(transaction, action)

      expect(transaction.narration).toBe('Split: 100.00 / -100.00')
    })

    it('should replace metadata variables', () => {
      const transaction = createMockTransaction({
        metadata: {
          category: new Value({ type: 'string', value: 'groceries' }),
        },
      })
      const action: Action = {
        type: 'modify_narration',
        operation: 'replace',
        value: 'Category: $metadata_category',
      }

      applyAction(transaction, action)

      expect(transaction.narration).toBe('Category: groceries')
    })

    it('should throw error when variable undefined', () => {
      const transaction = createMockTransaction()
      const action: Action = {
        type: 'modify_narration',
        operation: 'replace',
        value: 'Missing: $missingVariable',
      }

      expect(() => {
        applyAction(transaction, action)
      }).toThrow("Variable '$missingVariable' is not defined")
    })

    it('should handle escaped dollar signs', () => {
      const transaction = createMockTransaction({
        narration: 'Purchase',
      })
      const action: Action = {
        type: 'modify_narration',
        operation: 'replace',
        value: 'Cost: $50 with $narration',
      }

      applyAction(transaction, action)

      expect(transaction.narration).toBe('Cost: $50 with Purchase')
    })
  })
})
