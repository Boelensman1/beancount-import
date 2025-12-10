/**
 * Tests for modify_posting action
 */
import { describe, it, expect } from 'vitest'
import { Value } from 'beancount'
import { applyAction } from '../engine'
import type { Action } from '@/lib/db/types'
import { createMockTransaction, createMockPosting } from '@/test/test-utils'

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

    applyAction(transaction, action)

    expect(transaction.postings[0].account).toBe('Assets:Savings')
    expect(transaction.postings[1].account).toBe('Expenses:Food')
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

    applyAction(transaction, action)

    expect(transaction.postings[0].account).toBe('Assets:Checking')
    expect(transaction.postings[1].account).toBe('Expenses:Groceries')
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

    applyAction(transaction, action)

    expect(transaction.postings[0].amount).toBe('250')
    expect(transaction.postings[0].currency).toBe('EUR')
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

    applyAction(transaction, action)

    expect(transaction.postings[0].account).toBe('Assets:Savings')
    expect(transaction.postings[0].amount).toBe('300')
    expect(transaction.postings[0].currency).toBe('GBP')
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

    applyAction(transaction, action)

    expect(transaction.postings[0].account).toBe('Assets:Checking')
    expect(transaction.postings[1].account).toBe('Expenses:Food')
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

    applyAction(transaction, action)

    expect(transaction.postings[0].account).toBe('Assets:Checking')
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

    applyAction(transaction, action)

    expect(transaction.postings[0].amount).toBe('-75')
    expect(transaction.postings[1].amount).toBe('-75')
    expect(transaction.postings[2].amount).toBe('100')
  })

  describe('variable replacement', () => {
    it('should replace variables in newAccount field', () => {
      const transaction = createMockTransaction({
        metadata: {
          category: new Value({ type: 'string', value: 'Food' }),
        },
        postings: [
          createMockPosting({ account: 'Expenses:Unknown', amount: '-50' }),
        ],
      })
      const action: Action = {
        type: 'modify_posting',
        selector: { index: 0 },
        newAccount: 'Expenses:$metadata_category',
      }

      applyAction(transaction, action)

      expect(transaction.postings[0].account).toBe('Expenses:Food')
    })

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

      applyAction(transaction, action)

      expect(transaction.postings[1].amount).toBe('100')
    })

    it('should replace variables with index selector', () => {
      const transaction = createMockTransaction({
        narration: 'Grocery shopping',
        postings: [
          createMockPosting({ account: 'Assets:Checking', amount: '75.50' }),
        ],
      })
      const action: Action = {
        type: 'modify_posting',
        selector: { index: 0 },
        newAmount: { value: '$postingAmount[0]', currency: 'USD' },
      }

      applyAction(transaction, action)

      expect(transaction.postings[0].amount).toBe('75.50')
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

      applyAction(transaction, action)

      expect(transaction.postings[0].account).toBe('Expenses:Entertainment')
    })

    it('should replace multiple variables in both account and amount', () => {
      const transaction = createMockTransaction({
        metadata: {
          category: new Value({ type: 'string', value: 'Transport' }),
        },
        postings: [
          createMockPosting({ account: 'Expenses:Unknown', amount: '-25' }),
          createMockPosting({ account: 'Assets:Cash', amount: '50.00' }),
        ],
      })
      const action: Action = {
        type: 'modify_posting',
        selector: { index: 0 },
        newAccount: 'Expenses:$metadata_category',
        newAmount: { value: '$postingAmount[1]', currency: 'USD' },
      }

      applyAction(transaction, action)

      expect(transaction.postings[0].account).toBe('Expenses:Transport')
      expect(transaction.postings[0].amount).toBe('50.00')
    })

    it('should throw error for undefined variable in newAccount', () => {
      const transaction = createMockTransaction({
        postings: [createMockPosting({ account: 'Expenses:Food' })],
      })
      const action: Action = {
        type: 'modify_posting',
        selector: { index: 0 },
        newAccount: 'Expenses:$undefinedCategory',
      }

      expect(() => applyAction(transaction, action)).toThrow(
        "Variable '$undefinedCategory' is not defined",
      )
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

      applyAction(transaction, action)

      expect(transaction.postings[0].account).toBe('Expenses:Dining:Restaurant')
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

      applyAction(transaction, action)

      expect(transaction.postings[1].currency).toBe('USD')
      expect(transaction.postings[1].amount).toBe('50')
    })
  })
})
