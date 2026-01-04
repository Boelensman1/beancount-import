/**
 * Tests for modify_posting action
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

describe('modify_posting', () => {
  it('should modify posting by index', () => {
    const transaction = createMockTransaction({
      postings: [
        createMockPosting({ account: 'Assets:Checking', amount: '100' }),
        createMockPosting({ account: 'Expenses:Food', amount: '-100' }),
      ],
    })
    const action: Action = {
      type: 'modify_posting',
      selector: { index: 0 },
      newAccount: 'Assets:Savings',
    }

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].postings[0].account).toBe('Assets:Savings')
    expect(result[0].postings[1].account).toBe('Expenses:Food')
  })

  it('should modify posting by account pattern', () => {
    const transaction = createMockTransaction({
      postings: [
        createMockPosting({ account: 'Assets:Checking', amount: '100' }),
        createMockPosting({ account: 'Expenses:Food', amount: '-100' }),
      ],
    })
    const action: Action = {
      type: 'modify_posting',
      selector: { accountPattern: '^Expenses:' },
      newAccount: 'Expenses:Groceries',
    }

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].postings[0].account).toBe('Assets:Checking')
    expect(result[0].postings[1].account).toBe('Expenses:Groceries')
  })

  it('should modify posting amount', () => {
    const transaction = createMockTransaction({
      postings: [createMockPosting({ account: 'Assets:Checking' })],
    })
    const action: Action = {
      type: 'modify_posting',
      selector: { index: 0 },
      newAmount: { value: '250', currency: 'EUR' },
    }

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].postings[0].amount).toBe('250')
    expect(result[0].postings[0].currency).toBe('EUR')
  })

  it('should modify both account and amount', () => {
    const transaction = createMockTransaction({
      postings: [createMockPosting({ account: 'Assets:Checking' })],
    })
    const action: Action = {
      type: 'modify_posting',
      selector: { index: 0 },
      newAccount: 'Assets:Savings',
      newAmount: { value: '300', currency: 'GBP' },
    }

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].postings[0].account).toBe('Assets:Savings')
    expect(result[0].postings[0].amount).toBe('300')
    expect(result[0].postings[0].currency).toBe('GBP')
  })

  it('should not modify postings that do not match selector', () => {
    const transaction = createMockTransaction({
      postings: [
        createMockPosting({ account: 'Assets:Checking', amount: '100' }),
        createMockPosting({ account: 'Expenses:Food', amount: '-100' }),
      ],
    })
    const action: Action = {
      type: 'modify_posting',
      selector: { accountPattern: '^Liabilities:' },
      newAccount: 'Liabilities:CreditCard',
    }

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].postings[0].account).toBe('Assets:Checking')
    expect(result[0].postings[1].account).toBe('Expenses:Food')
  })

  it('should handle invalid regex in account pattern', () => {
    const transaction = createMockTransaction({
      postings: [createMockPosting({ account: 'Assets:Checking' })],
    })
    const action: Action = {
      type: 'modify_posting',
      selector: { accountPattern: '[invalid(' },
      newAccount: 'Assets:Savings',
    }

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].postings[0].account).toBe('Assets:Checking')
  })

  it('should modify multiple matching postings', () => {
    const transaction = createMockTransaction({
      postings: [
        createMockPosting({ account: 'Expenses:Food', amount: '-50' }),
        createMockPosting({
          account: 'Expenses:Entertainment',
          amount: '-50',
        }),
        createMockPosting({ account: 'Assets:Checking', amount: '100' }),
      ],
    })
    const action: Action = {
      type: 'modify_posting',
      selector: { accountPattern: '^Expenses:' },
      newAmount: { value: '-75', currency: 'USD' },
    }

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].postings[0].amount).toBe('-75')
    expect(result[0].postings[1].amount).toBe('-75')
    expect(result[0].postings[2].amount).toBe('100')
  })

  // Use shared helper for standard variable replacement tests (tests newAccount field)
  describeVariableReplacement(
    applyAction,
    (value) =>
      ({
        type: 'modify_posting',
        selector: { index: 0 },
        newAccount: value,
      }) as Action,
    (result) => (result as Transaction[])[0].postings[0].account,
  )

  // Additional tests for newAmount/currency field variable replacement
  describe('amount and currency variable replacement', () => {
    it('should replace variables in newAmount field', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ account: 'Assets:Checking', amount: '100' }),
          createMockPosting({ account: 'Expenses:Food', amount: '-50' }),
        ],
      })
      const action: Action = {
        type: 'modify_posting',
        selector: { index: 1 },
        newAmount: { value: '$postingAmount[0]', currency: 'USD' },
      }

      const result = applyAction(transaction, action) as [Transaction]

      expect(result).toHaveLength(1)
      expect(result[0].postings[1].amount).toBe('100')
    })

    it('should replace variables with pattern selector', () => {
      const transaction = createMockTransaction({
        metadata: {
          newCategory: new Value({ type: 'string', value: 'Entertainment' }),
        },
        postings: [
          createMockPosting({ account: 'Expenses:Food', amount: '-50' }),
          createMockPosting({ account: 'Assets:Checking', amount: '50' }),
        ],
      })
      const action: Action = {
        type: 'modify_posting',
        selector: { accountPattern: '^Expenses:' },
        newAccount: 'Expenses:$metadata_newCategory',
      }

      const result = applyAction(transaction, action) as [Transaction]

      expect(result).toHaveLength(1)
      expect(result[0].postings[0].account).toBe('Expenses:Entertainment')
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
      const action: Action = {
        type: 'modify_posting',
        selector: { index: 1 },
        newAmount: { value: '50', currency: '$postingCurrency[0]' },
      }

      const result = applyAction(transaction, action) as [Transaction]

      expect(result).toHaveLength(1)
      expect(result[0].postings[1].currency).toBe('USD')
      expect(result[0].postings[1].amount).toBe('50')
    })

    it('should throw error for undefined variable in newAmount', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ account: 'Expenses:Food', amount: '-50' }),
        ],
      })
      const action: Action = {
        type: 'modify_posting',
        selector: { index: 0 },
        newAmount: { value: '$undefinedAmount', currency: 'USD' },
      }

      expect(() => applyAction(transaction, action)).toThrow(
        "Variable '$undefinedAmount' is not defined",
      )
    })

    it('should handle complex account expressions with multiple variables', () => {
      const transaction = createMockTransaction({
        metadata: {
          type: new Value({ type: 'string', value: 'Dining' }),
          subtype: new Value({ type: 'string', value: 'Restaurant' }),
        },
        postings: [createMockPosting({ account: 'Expenses:Unknown' })],
      })
      const action: Action = {
        type: 'modify_posting',
        selector: { index: 0 },
        newAccount: 'Expenses:$metadata_type:$metadata_subtype',
      }

      const result = applyAction(transaction, action) as [Transaction]

      expect(result).toHaveLength(1)
      expect(result[0].postings[0].account).toBe('Expenses:Dining:Restaurant')
    })
  })
})
