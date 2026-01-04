/**
 * Tests for add_posting action
 */
import { describe, it, expect } from 'vitest'
import { Value, type Transaction } from 'beancount'
import type { Action } from '@/lib/db/types'
import {
  createMockTransaction,
  createMockPosting,
  describeVariableReplacement,
} from '@/test/test-utils'

import { applyAction } from '../actions'

describe('add_posting', () => {
  it('should add posting with explicit amount', () => {
    const transaction = createMockTransaction()
    const initialCount = transaction.postings.length
    const action: Action = {
      type: 'add_posting',
      account: 'Expenses:Entertainment',
      amount: { value: '50', currency: 'USD' },
    }

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].postings).toHaveLength(initialCount + 1)
    const newPosting = result[0].postings[initialCount]
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

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].postings).toHaveLength(initialCount + 1)
    const newPosting = result[0].postings[initialCount]
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

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].postings).toHaveLength(initialCount + 1)
    const newPosting = result[0].postings[initialCount]
    expect(newPosting.account).toBe('Expenses:Entertainment')
    expect(newPosting.amount).toBe('')
    expect(newPosting.currency).toBe('')
  })

  // Use shared helper for standard variable replacement tests (tests account field)
  describeVariableReplacement(
    applyAction,
    (value) => ({ type: 'add_posting', account: value }) as Action,
    (result) => {
      const tx = (result as Transaction[])[0]
      return tx.postings[tx.postings.length - 1].account
    },
  )

  // Additional tests for amount/currency field variable replacement
  describe('amount and currency variable replacement', () => {
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

      const result = applyAction(transaction, action) as [Transaction]

      expect(result).toHaveLength(1)
      const newPosting = result[0].postings[initialCount]
      expect(newPosting.amount).toBe('100.00')
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

      const result = applyAction(transaction, action) as [Transaction]

      expect(result).toHaveLength(1)
      const newPosting = result[0].postings[initialCount]
      expect(newPosting.currency).toBe('EUR')
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

    it('should handle complex account with multiple variables', () => {
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

      const result = applyAction(transaction, action) as [Transaction]

      expect(result).toHaveLength(1)
      const newPosting = result[0].postings[initialCount]
      expect(newPosting.account).toBe('Expenses:Food:Starbucks:Seattle')
    })
  })
})
