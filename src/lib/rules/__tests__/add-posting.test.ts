/**
 * Tests for add_posting action
 */
import { describe, it, expect } from 'vitest'
import { Value } from 'beancount'
import { applyAction } from '../engine'
import type { Action } from '@/lib/db/types'
import { createMockTransaction, createMockPosting } from '@/test/test-utils'

describe('add_posting', () => {
  it('should add posting with explicit amount', () => {
    const transaction = createMockTransaction()
    const initialCount = transaction.postings.length
    const action: Action = {
      type: 'add_posting',
      account: 'Expenses:Entertainment',
      amount: { value: '50', currency: 'USD' },
    }

    applyAction(transaction, action)

    expect(transaction.postings).toHaveLength(initialCount + 1)
    const newPosting = transaction.postings[initialCount]
    expect(newPosting.account).toBe('Expenses:Entertainment')
    expect(newPosting.amount).toBe('50')
    expect(newPosting.currency).toBe('USD')
  })

  it('should add posting with auto amount', () => {
    const transaction = createMockTransaction()
    const initialCount = transaction.postings.length
    const action: Action = {
      type: 'add_posting',
      account: 'Expenses:Entertainment',
      amount: { value: 'auto', currency: 'USD' },
    }

    applyAction(transaction, action)

    expect(transaction.postings).toHaveLength(initialCount + 1)
    const newPosting = transaction.postings[initialCount]
    expect(newPosting.account).toBe('Expenses:Entertainment')
    expect(newPosting.amount).toBeUndefined()
    expect(newPosting.currency).toBe('USD')
  })

  it('should add posting without amount', () => {
    const transaction = createMockTransaction()
    const initialCount = transaction.postings.length
    const action: Action = {
      type: 'add_posting',
      account: 'Expenses:Entertainment',
    }

    applyAction(transaction, action)

    expect(transaction.postings).toHaveLength(initialCount + 1)
    const newPosting = transaction.postings[initialCount]
    expect(newPosting.account).toBe('Expenses:Entertainment')
    expect(newPosting.amount).toBe('')
    expect(newPosting.currency).toBe('')
  })

  describe('variable replacement', () => {
    it('should replace variables in account field', () => {
      const transaction = createMockTransaction({
        metadata: {
          category: new Value({ type: 'string', value: 'Food' }),
        },
      })
      const initialCount = transaction.postings.length
      const action: Action = {
        type: 'add_posting',
        account: 'Expenses:$metadata_category',
        amount: { value: '50', currency: 'USD' },
      }

      applyAction(transaction, action)

      const newPosting = transaction.postings[initialCount]
      expect(newPosting.account).toBe('Expenses:Food')
    })

    it('should replace variables in amount field', () => {
      const transaction = createMockTransaction({
        postings: [createMockPosting({ amount: '100.00', currency: 'USD' })],
      })
      const initialCount = transaction.postings.length
      const action: Action = {
        type: 'add_posting',
        account: 'Expenses:Entertainment',
        amount: { value: '$postingAmount[0]', currency: 'USD' },
      }

      applyAction(transaction, action)

      const newPosting = transaction.postings[initialCount]
      expect(newPosting.amount).toBe('100.00')
    })

    it('should replace variables in both account and amount', () => {
      const transaction = createMockTransaction({
        metadata: {
          category: new Value({ type: 'string', value: 'Food' }),
        },
        postings: [
          createMockPosting({
            account: 'Assets:Checking',
            amount: '75.50',
            currency: 'USD',
          }),
        ],
      })
      const initialCount = transaction.postings.length
      const action: Action = {
        type: 'add_posting',
        account: 'Expenses:$metadata_category',
        amount: { value: '$postingAmount[0]', currency: 'USD' },
      }

      applyAction(transaction, action)

      const newPosting = transaction.postings[initialCount]
      expect(newPosting.account).toBe('Expenses:Food')
      expect(newPosting.amount).toBe('75.50')
    })

    it('should handle auto amount with variable in account', () => {
      const transaction = createMockTransaction({
        metadata: {
          category: new Value({ type: 'string', value: 'Entertainment' }),
        },
      })
      const initialCount = transaction.postings.length
      const action: Action = {
        type: 'add_posting',
        account: 'Expenses:$metadata_category',
        amount: { value: 'auto', currency: 'USD' },
      }

      applyAction(transaction, action)

      const newPosting = transaction.postings[initialCount]
      expect(newPosting.account).toBe('Expenses:Entertainment')
      expect(newPosting.amount).toBeUndefined()
    })

    it('should replace array-indexed posting variables', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({
            account: 'Assets:Checking',
            amount: '100.00',
            currency: 'USD',
          }),
          createMockPosting({
            account: 'Expenses:Food',
            amount: '-100.00',
            currency: 'EUR',
          }),
        ],
      })
      const initialCount = transaction.postings.length
      const action: Action = {
        type: 'add_posting',
        account: '$postingAccount[1]',
        amount: { value: '$postingAmount[1]', currency: 'USD' },
      }

      applyAction(transaction, action)

      const newPosting = transaction.postings[initialCount]
      expect(newPosting.account).toBe('Expenses:Food')
      expect(newPosting.amount).toBe('-100.00')
    })

    it('should throw error for undefined variable in amount', () => {
      const transaction = createMockTransaction()
      const action: Action = {
        type: 'add_posting',
        account: 'Expenses:Food',
        amount: { value: '$undefinedAmount', currency: 'USD' },
      }

      expect(() => applyAction(transaction, action)).toThrow(
        "Variable '$undefinedAmount' is not defined",
      )
    })

    it('should throw error for undefined variable in account', () => {
      const transaction = createMockTransaction()
      const action: Action = {
        type: 'add_posting',
        account: 'Expenses:$undefinedCategory',
        amount: { value: '50', currency: 'USD' },
      }

      expect(() => applyAction(transaction, action)).toThrow(
        "Variable '$undefinedCategory' is not defined",
      )
    })

    it('should handle complex account expressions', () => {
      const transaction = createMockTransaction({
        metadata: {
          merchant: new Value({ type: 'string', value: 'Starbucks' }),
          location: new Value({ type: 'string', value: 'Seattle' }),
        },
      })
      const initialCount = transaction.postings.length
      const action: Action = {
        type: 'add_posting',
        account: 'Expenses:Food:$metadata_merchant:$metadata_location',
        amount: { value: '5.00', currency: 'USD' },
      }

      applyAction(transaction, action)

      const newPosting = transaction.postings[initialCount]
      expect(newPosting.account).toBe('Expenses:Food:Starbucks:Seattle')
    })

    it('should replace variables in currency field', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({
            account: 'Assets:Checking',
            amount: '100.00',
            currency: 'USD',
          }),
          createMockPosting({
            account: 'Expenses:Food',
            amount: '-100.00',
            currency: 'EUR',
          }),
        ],
      })
      const initialCount = transaction.postings.length
      const action: Action = {
        type: 'add_posting',
        account: 'Assets:Investment',
        amount: { value: '50', currency: '$postingCurrency[1]' },
      }

      applyAction(transaction, action)

      const newPosting = transaction.postings[initialCount]
      expect(newPosting.currency).toBe('EUR')
    })
  })
})
