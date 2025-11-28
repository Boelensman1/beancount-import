/**
 * Tests for add_metadata action
 */
import { describe, it, expect } from 'vitest'
import { Value } from 'beancount'
import { applyAction } from '../engine'
import type { Action } from '@/lib/db/types'
import { createMockTransaction, createMockPosting } from '@/test/test-utils'

describe('add_metadata', () => {
  it('should add metadata to transaction', () => {
    const transaction = createMockTransaction()
    const action: Action = {
      type: 'add_metadata',
      key: 'category',
      value: 'groceries',
    }

    applyAction(transaction, action)

    expect(transaction.metadata).toBeDefined()
    expect(transaction.metadata!.category).toBeDefined()
    expect(transaction.metadata!.category.value).toBe('groceries')
  })

  it('should not overwrite existing metadata by default', () => {
    const transaction = createMockTransaction({
      metadata: {
        existing: new Value({ type: 'string', value: 'original' }),
      },
    })
    const action: Action = {
      type: 'add_metadata',
      key: 'existing',
      value: 'new',
    }

    applyAction(transaction, action)

    expect(transaction.metadata!.existing.value).toBe('original')
  })

  it('should overwrite existing metadata when overwrite is true', () => {
    const transaction = createMockTransaction({
      metadata: {
        existing: new Value({ type: 'string', value: 'original' }),
      },
    })
    const action: Action = {
      type: 'add_metadata',
      key: 'existing',
      value: 'new',
      overwrite: true,
    }

    applyAction(transaction, action)

    expect(transaction.metadata!.existing.value).toBe('new')
  })

  it('should handle number metadata values', () => {
    const transaction = createMockTransaction()
    const action: Action = {
      type: 'add_metadata',
      key: 'quantity',
      value: 42,
    }

    applyAction(transaction, action)

    expect(transaction.metadata!.quantity.value).toBe('42')
    expect(transaction.metadata!.quantity.type).toBe('numbers')
  })

  it('should handle boolean metadata values', () => {
    const transaction = createMockTransaction()
    const action: Action = {
      type: 'add_metadata',
      key: 'reviewed',
      value: true,
    }

    applyAction(transaction, action)

    expect(transaction.metadata!.reviewed.value).toBe(true)
    expect(transaction.metadata!.reviewed.type).toBe('boolean')
  })

  it('should initialize metadata object if not exists', () => {
    const transaction = createMockTransaction({ metadata: undefined })
    const action: Action = {
      type: 'add_metadata',
      key: 'test',
      value: 'value',
    }

    applyAction(transaction, action)

    expect(transaction.metadata).toBeDefined()
    expect(transaction.metadata!.test).toBeDefined()
  })

  describe('variable replacement', () => {
    it('should replace variables in string value', () => {
      const transaction = createMockTransaction({
        narration: 'Coffee at Starbucks',
        payee: 'Starbucks',
      })
      const action: Action = {
        type: 'add_metadata',
        key: 'note',
        value: 'Transaction: $narration from $payee',
      }

      applyAction(transaction, action)

      expect(transaction.metadata!.note.value).toBe(
        'Transaction: Coffee at Starbucks from Starbucks',
      )
    })

    it('should replace posting variables in metadata', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({
            account: 'Assets:Checking',
            amount: '100.00',
            currency: 'USD',
          }),
        ],
      })
      const action: Action = {
        type: 'add_metadata',
        key: 'sourceAccount',
        value: '$postingAccount[0]',
      }

      applyAction(transaction, action)

      expect(transaction.metadata!.sourceAccount.value).toBe('Assets:Checking')
    })

    it('should replace metadata variables', () => {
      const transaction = createMockTransaction({
        metadata: {
          category: new Value({ type: 'string', value: 'Food' }),
        },
      })
      const action: Action = {
        type: 'add_metadata',
        key: 'fullCategory',
        value: 'Expenses:$metadata_category',
      }

      applyAction(transaction, action)

      expect(transaction.metadata!.fullCategory.value).toBe('Expenses:Food')
    })

    it('should handle complex expressions with multiple variables', () => {
      const transaction = createMockTransaction({
        narration: 'Grocery shopping',
        metadata: {
          merchant: new Value({ type: 'string', value: 'Whole Foods' }),
        },
        postings: [createMockPosting({ amount: '85.50', currency: 'USD' })],
      })
      const action: Action = {
        type: 'add_metadata',
        key: 'summary',
        value:
          '$narration at $metadata_merchant for $postingAmount[0] $postingCurrency[0]',
      }

      applyAction(transaction, action)

      expect(transaction.metadata!.summary.value).toBe(
        'Grocery shopping at Whole Foods for 85.50 USD',
      )
    })

    it('should preserve value type when using variables', () => {
      const transaction = createMockTransaction({
        postings: [createMockPosting({ amount: '100.00' })],
      })
      const action: Action = {
        type: 'add_metadata',
        key: 'amount',
        value: '$postingAmount[0]',
      }

      applyAction(transaction, action)

      // Value should be stored as string type
      expect(transaction.metadata!.amount.type).toBe('string')
      expect(transaction.metadata!.amount.value).toBe('100.00')
    })

    it('should throw error for undefined variable', () => {
      const transaction = createMockTransaction()
      const action: Action = {
        type: 'add_metadata',
        key: 'test',
        value: '$undefinedVariable',
      }

      expect(() => applyAction(transaction, action)).toThrow(
        "Variable '$undefinedVariable' is not defined",
      )
    })
  })
})
