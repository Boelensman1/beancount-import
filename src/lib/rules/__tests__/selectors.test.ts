/**
 * Tests for selector matching logic
 */
import { describe, it, expect } from 'vitest'
import type {
  SelectorExpression,
  NarrationSelector,
  PayeeSelector,
} from '@/lib/db/types'
import {
  createMockTransaction,
  createMockPosting,
  createTag,
  createAccountSelector,
  createNarrationSelector,
  createPayeeSelector,
  createAmountSelector,
  createDateSelector,
  createFlagSelector,
  createTagSelector,
  createNeverSelector,
} from '@/test/test-utils'

import { matchesSelector } from '../selectors'

describe('matchesSelector', () => {
  describe('account selector', () => {
    it('should match exact account name', () => {
      const transaction = createMockTransaction()
      const selector = createAccountSelector('Assets:Checking', 'exact')

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should not match different account name', () => {
      const transaction = createMockTransaction()
      const selector = createAccountSelector('Assets:Savings', 'exact')

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should match glob pattern with wildcard', () => {
      const transaction = createMockTransaction()
      const selector = createAccountSelector('Assets:*', 'glob')

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should match glob pattern with multiple wildcards', () => {
      const transaction = createMockTransaction()
      const selector = createAccountSelector('*:Check*', 'glob')

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should match glob pattern with question mark', () => {
      const transaction = createMockTransaction()
      const selector = createAccountSelector('Assets:Checkin?', 'glob')

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should not match non-matching glob pattern', () => {
      const transaction = createMockTransaction()
      const selector = createAccountSelector('Liabilities:*', 'glob')

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should match regex pattern', () => {
      const transaction = createMockTransaction()
      const selector = createAccountSelector('^Assets:', 'regex')

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should match complex regex pattern', () => {
      const transaction = createMockTransaction()
      const selector = createAccountSelector(
        'Assets:(Checking|Savings)',
        'regex',
      )

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should not match non-matching regex', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ account: 'Assets:Checking' }),
          createMockPosting({ account: 'Assets:Savings' }),
        ],
      })
      const selector = createAccountSelector('^Expenses:', 'regex')

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should handle invalid regex gracefully', () => {
      const transaction = createMockTransaction()
      const selector = createAccountSelector('[invalid(regex', 'regex')

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should return false when transaction has no postings', () => {
      const transaction = createMockTransaction({ postings: [] })
      const selector = createAccountSelector('Assets:Checking', 'exact')

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should match when any posting matches', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ account: 'Liabilities:CreditCard' }),
          createMockPosting({ account: 'Assets:Checking' }),
        ],
      })
      const selector = createAccountSelector('Assets:Checking', 'exact')

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should handle empty account string', () => {
      const transaction = createMockTransaction({
        postings: [createMockPosting({ account: '' })],
      })
      const selector = createAccountSelector('', 'exact')

      expect(matchesSelector(transaction, selector)).toBe(true)
    })
  })

  describe('narration selector', () => {
    it('should match exact narration', () => {
      const transaction = createMockTransaction({
        narration: 'Coffee at Starbucks',
      })
      const selector = createNarrationSelector('Coffee at Starbucks', 'exact')

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should not match different narration', () => {
      const transaction = createMockTransaction({ narration: 'Coffee' })
      const selector = createNarrationSelector('Tea', 'exact')

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should match substring (case sensitive)', () => {
      const transaction = createMockTransaction({
        narration: 'Coffee at Starbucks',
      })
      const selector = createNarrationSelector('Starbucks', 'substring', true)

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should not match substring with wrong case (case sensitive)', () => {
      const transaction = createMockTransaction({
        narration: 'Coffee at Starbucks',
      })
      const selector = createNarrationSelector('starbucks', 'substring', true)

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should match substring ignoring case (case insensitive)', () => {
      const transaction = createMockTransaction({
        narration: 'Coffee at Starbucks',
      })
      const selector = createNarrationSelector('starbucks', 'substring', false)

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should match regex pattern', () => {
      const transaction = createMockTransaction({
        narration: 'Coffee at Starbucks',
      })
      const selector = createNarrationSelector(
        'Coffee.*Starbucks',
        'regex',
        true,
      )

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should match regex with case insensitive flag', () => {
      const transaction = createMockTransaction({
        narration: 'Coffee at Starbucks',
      })
      const selector = createNarrationSelector(
        'coffee.*starbucks',
        'regex',
        false,
      )

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should handle invalid regex gracefully', () => {
      const transaction = createMockTransaction({ narration: 'Test' })
      const selector = createNarrationSelector('[invalid(', 'regex')

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should handle empty narration', () => {
      const transaction = createMockTransaction({ narration: '' })
      const selector = createNarrationSelector('', 'exact')

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should default to case sensitive when not specified', () => {
      const transaction = createMockTransaction({
        narration: 'Coffee at Starbucks',
      })
      const selector: NarrationSelector = {
        type: 'narration',
        pattern: 'starbucks',
        matchType: 'substring',
      }

      expect(matchesSelector(transaction, selector)).toBe(false)
    })
  })

  describe('payee selector', () => {
    it('should match exact payee', () => {
      const transaction = createMockTransaction({ payee: 'Amazon.com' })
      const selector = createPayeeSelector('Amazon.com', 'exact')

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should not match different payee', () => {
      const transaction = createMockTransaction({ payee: 'Amazon' })
      const selector = createPayeeSelector('Walmart', 'exact')

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should match substring (case sensitive)', () => {
      const transaction = createMockTransaction({ payee: 'Amazon.com' })
      const selector = createPayeeSelector('Amazon', 'substring', true)

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should not match substring with wrong case (case sensitive)', () => {
      const transaction = createMockTransaction({ payee: 'Amazon.com' })
      const selector = createPayeeSelector('amazon', 'substring', true)

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should match substring ignoring case (case insensitive)', () => {
      const transaction = createMockTransaction({ payee: 'Amazon.com' })
      const selector = createPayeeSelector('amazon', 'substring', false)

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should match regex pattern', () => {
      const transaction = createMockTransaction({ payee: 'Amazon.com' })
      const selector = createPayeeSelector('^Amazon', 'regex', true)

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should match regex with case insensitive flag', () => {
      const transaction = createMockTransaction({ payee: 'Amazon.com' })
      const selector = createPayeeSelector('^amazon', 'regex', false)

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should handle invalid regex gracefully', () => {
      const transaction = createMockTransaction({ payee: 'Amazon' })
      const selector = createPayeeSelector('[invalid(', 'regex')

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should handle empty payee', () => {
      const transaction = createMockTransaction({ payee: '' })
      const selector = createPayeeSelector('', 'exact')

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should handle undefined payee', () => {
      const transaction = createMockTransaction({ payee: undefined })
      const selector = createPayeeSelector('', 'exact')

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should default to case sensitive when not specified', () => {
      const transaction = createMockTransaction({ payee: 'Amazon.com' })
      const selector: PayeeSelector = {
        type: 'payee',
        pattern: 'amazon',
        matchType: 'substring',
      }

      expect(matchesSelector(transaction, selector)).toBe(false)
    })
  })

  describe('amount selector', () => {
    it('should match amount within range', () => {
      const transaction = createMockTransaction()
      const selector = createAmountSelector({ min: 50, max: 150 })

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should not match amount below minimum', () => {
      const transaction = createMockTransaction()
      const selector = createAmountSelector({ min: 200 })

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should not match amount above maximum', () => {
      const transaction = createMockTransaction({
        postings: [createMockPosting({ amount: '200', currency: 'USD' })],
      })
      const selector = createAmountSelector({ max: 50 })

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should match amount equal to minimum', () => {
      const transaction = createMockTransaction()
      const selector = createAmountSelector({ min: 100 })

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should match amount equal to maximum', () => {
      const transaction = createMockTransaction()
      const selector = createAmountSelector({ max: 100 })

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should match when only minimum is specified', () => {
      const transaction = createMockTransaction()
      const selector = createAmountSelector({ min: 50 })

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should match when only maximum is specified', () => {
      const transaction = createMockTransaction()
      const selector = createAmountSelector({ max: 200 })

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should filter by currency', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ amount: '100', currency: 'USD' }),
          createMockPosting({ amount: '200', currency: 'EUR' }),
        ],
      })
      const selector = createAmountSelector({ min: 150, currency: 'EUR' })

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should not match when currency does not match', () => {
      const transaction = createMockTransaction({
        postings: [createMockPosting({ amount: '100', currency: 'USD' })],
      })
      const selector = createAmountSelector({ min: 50, currency: 'EUR' })

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should return false when transaction has no postings', () => {
      const transaction = createMockTransaction({ postings: [] })
      const selector = createAmountSelector({ min: 0 })

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should handle negative amounts', () => {
      const transaction = createMockTransaction({
        postings: [createMockPosting({ amount: '-100', currency: 'USD' })],
      })
      const selector = createAmountSelector({ min: -200, max: -50 })

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should match when any posting satisfies criteria', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ amount: '10', currency: 'USD' }),
          createMockPosting({ amount: '500', currency: 'USD' }),
        ],
      })
      const selector = createAmountSelector({ min: 400 })

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should match when no min/max specified', () => {
      const transaction = createMockTransaction()
      const selector = createAmountSelector({})

      expect(matchesSelector(transaction, selector)).toBe(true)
    })
  })

  describe('date selector', () => {
    it('should match date after specified date', () => {
      const transaction = createMockTransaction({
        date: '2024-06-15',
      })
      const selector = createDateSelector({ after: '2024-01-01' })

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should not match date on or before specified after date', () => {
      const transaction = createMockTransaction({
        date: '2024-01-01',
      })
      const selector = createDateSelector({ after: '2024-01-01' })

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should match date before specified date', () => {
      const transaction = createMockTransaction({
        date: '2024-01-15',
      })
      const selector = createDateSelector({ before: '2024-12-31' })

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should not match date on or after specified before date', () => {
      const transaction = createMockTransaction({
        date: '2024-12-31',
      })
      const selector = createDateSelector({ before: '2024-12-31' })

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should match date within range', () => {
      const transaction = createMockTransaction({
        date: '2024-06-15',
      })
      const selector = createDateSelector({
        after: '2024-01-01',
        before: '2024-12-31',
      })

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should not match date outside range', () => {
      const transaction = createMockTransaction({
        date: '2025-01-15',
      })
      const selector = createDateSelector({
        after: '2024-01-01',
        before: '2024-12-31',
      })

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should return false when transaction has no date', () => {
      const transaction = createMockTransaction()
      // Simulate a malformed transaction with no date
      ;(transaction as unknown as { date: undefined }).date = undefined
      const selector = createDateSelector({ after: '2024-01-01' })

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should match when no constraints specified', () => {
      const transaction = createMockTransaction()
      const selector = createDateSelector({})

      expect(matchesSelector(transaction, selector)).toBe(true)
    })
  })

  describe('flag selector', () => {
    it('should match transaction with specified flag', () => {
      const transaction = createMockTransaction({ flag: '*' })
      const selector = createFlagSelector('*')

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should not match transaction with different flag', () => {
      const transaction = createMockTransaction({ flag: '*' })
      const selector = createFlagSelector('!')

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should match custom flag', () => {
      const transaction = createMockTransaction({ flag: 'P' })
      const selector = createFlagSelector('P')

      expect(matchesSelector(transaction, selector)).toBe(true)
    })
  })

  describe('tag selector', () => {
    it('should match transaction with specified tag', () => {
      const transaction = createMockTransaction({
        tags: [createTag('vacation'), createTag('travel')],
      })
      const selector = createTagSelector('vacation')

      expect(matchesSelector(transaction, selector)).toBe(true)
    })

    it('should not match transaction without specified tag', () => {
      const transaction = createMockTransaction({
        tags: [createTag('vacation')],
      })
      const selector = createTagSelector('business')

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should return false when transaction has no tags', () => {
      const transaction = createMockTransaction({ tags: [] })
      const selector = createTagSelector('vacation')

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should match any tag in list', () => {
      const transaction = createMockTransaction({
        tags: [createTag('vacation'), createTag('travel'), createTag('europe')],
      })
      const selector = createTagSelector('europe')

      expect(matchesSelector(transaction, selector)).toBe(true)
    })
  })

  describe('never selector', () => {
    it('should never match any transaction', () => {
      const transaction = createMockTransaction()
      const selector = createNeverSelector()

      expect(matchesSelector(transaction, selector)).toBe(false)
    })

    it('should not match even with specific transaction data', () => {
      const transaction = createMockTransaction({
        narration: 'Test transaction',
        payee: 'Test payee',
        flag: '*',
        tags: [createTag('test')],
      })
      const selector = createNeverSelector()

      expect(matchesSelector(transaction, selector)).toBe(false)
    })
  })

  describe('logical operators', () => {
    describe('and operator', () => {
      it('should match when all conditions match', () => {
        const transaction = createMockTransaction({
          narration: 'Coffee at Starbucks',
          payee: 'Starbucks',
        })
        const selector: SelectorExpression = {
          type: 'and',
          conditions: [
            createNarrationSelector('Coffee', 'substring'),
            createPayeeSelector('Starbucks', 'exact'),
          ],
        }

        expect(matchesSelector(transaction, selector)).toBe(true)
      })

      it('should not match when any condition fails', () => {
        const transaction = createMockTransaction({
          narration: 'Coffee at Starbucks',
          payee: 'Starbucks',
        })
        const selector: SelectorExpression = {
          type: 'and',
          conditions: [
            createNarrationSelector('Coffee', 'substring'),
            createPayeeSelector('Amazon', 'exact'),
          ],
        }

        expect(matchesSelector(transaction, selector)).toBe(false)
      })

      it('should handle empty conditions array', () => {
        const transaction = createMockTransaction()
        const selector: SelectorExpression = {
          type: 'and',
          conditions: [],
        }

        expect(matchesSelector(transaction, selector)).toBe(true)
      })
    })

    describe('or operator', () => {
      it('should match when any condition matches', () => {
        const transaction = createMockTransaction({
          narration: 'Coffee at Starbucks',
        })
        const selector: SelectorExpression = {
          type: 'or',
          conditions: [
            createNarrationSelector('Coffee', 'substring'),
            createPayeeSelector('Amazon', 'exact'),
          ],
        }

        expect(matchesSelector(transaction, selector)).toBe(true)
      })

      it('should not match when no conditions match', () => {
        const transaction = createMockTransaction({
          narration: 'Coffee at Starbucks',
          payee: 'Starbucks',
        })
        const selector: SelectorExpression = {
          type: 'or',
          conditions: [
            createNarrationSelector('Tea', 'substring'),
            createPayeeSelector('Amazon', 'exact'),
          ],
        }

        expect(matchesSelector(transaction, selector)).toBe(false)
      })

      it('should handle empty conditions array', () => {
        const transaction = createMockTransaction()
        const selector: SelectorExpression = {
          type: 'or',
          conditions: [],
        }

        expect(matchesSelector(transaction, selector)).toBe(false)
      })
    })

    describe('not operator', () => {
      it('should match when condition does not match', () => {
        const transaction = createMockTransaction({
          narration: 'Coffee at Starbucks',
        })
        const selector: SelectorExpression = {
          type: 'not',
          condition: createNarrationSelector('Tea', 'substring'),
        }

        expect(matchesSelector(transaction, selector)).toBe(true)
      })

      it('should not match when condition matches', () => {
        const transaction = createMockTransaction({
          narration: 'Coffee at Starbucks',
        })
        const selector: SelectorExpression = {
          type: 'not',
          condition: createNarrationSelector('Coffee', 'substring'),
        }

        expect(matchesSelector(transaction, selector)).toBe(false)
      })
    })

    describe('nested operators', () => {
      it('should handle nested AND within OR', () => {
        const transaction = createMockTransaction({
          narration: 'Coffee at Starbucks',
          payee: 'Starbucks',
        })
        const selector: SelectorExpression = {
          type: 'or',
          conditions: [
            {
              type: 'and',
              conditions: [
                createNarrationSelector('Coffee', 'substring'),
                createPayeeSelector('Starbucks', 'exact'),
              ],
            },
            createNarrationSelector('Tea', 'substring'),
          ],
        }

        expect(matchesSelector(transaction, selector)).toBe(true)
      })

      it('should handle nested OR within AND', () => {
        const transaction = createMockTransaction({
          narration: 'Coffee at Starbucks',
          flag: '*',
        })
        const selector: SelectorExpression = {
          type: 'and',
          conditions: [
            {
              type: 'or',
              conditions: [
                createNarrationSelector('Coffee', 'substring'),
                createNarrationSelector('Tea', 'substring'),
              ],
            },
            createFlagSelector('*'),
          ],
        }

        expect(matchesSelector(transaction, selector)).toBe(true)
      })

      it('should handle NOT within AND', () => {
        const transaction = createMockTransaction({
          narration: 'Coffee at Starbucks',
          payee: 'Starbucks',
        })
        const selector: SelectorExpression = {
          type: 'and',
          conditions: [
            createNarrationSelector('Coffee', 'substring'),
            {
              type: 'not',
              condition: createPayeeSelector('Amazon', 'exact'),
            },
          ],
        }

        expect(matchesSelector(transaction, selector)).toBe(true)
      })

      it('should handle complex nested logic', () => {
        const transaction = createMockTransaction({
          narration: 'Grocery shopping',
          postings: [
            createMockPosting({ account: 'Expenses:Groceries', amount: '150' }),
          ],
          flag: '*',
        })
        const selector: SelectorExpression = {
          type: 'and',
          conditions: [
            {
              type: 'or',
              conditions: [
                createNarrationSelector('Grocery', 'substring'),
                createNarrationSelector('Food', 'substring'),
              ],
            },
            {
              type: 'not',
              condition: createFlagSelector('!'),
            },
            createAmountSelector({ min: 100 }),
          ],
        }

        expect(matchesSelector(transaction, selector)).toBe(true)
      })
    })
  })
})
