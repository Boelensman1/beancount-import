/**
 * Comprehensive tests for the rule engine
 */
import { Temporal } from '@js-temporal/polyfill'
import { describe, it, expect } from 'vitest'
import {
  ParseResult,
  Transaction,
  Posting,
  Tag,
  Value,
  type Entry,
} from 'beancount'
import {
  matchesSelector,
  validateExpectations,
  applyAction,
  processTransaction,
  processImportWithRules,
  buildVariablesFromTransaction,
} from './engine'
import type {
  Rule,
  SelectorExpression,
  Action,
  AccountSelector,
  NarrationSelector,
  PayeeSelector,
  AmountSelector,
  DateSelector,
  FlagSelector,
  TagSelector,
} from '@/lib/db/types'

// ============================================================================
// TEST UTILITIES - DRY Factory Functions
// ============================================================================

/**
 * Create a mock transaction with sensible defaults
 */
function createMockTransaction(
  overrides: Partial<{
    date: string | Temporal.PlainDate
    flag: string
    payee: string
    narration: string
    postings: Posting[]
    tags: Tag[]
    links: Set<string>
    metadata: Record<string, Value>
  }> = {},
): Transaction {
  const defaults = {
    date: '2024-01-15',
    flag: '*',
    payee: 'Test Payee',
    narration: 'Test Narration',
    postings: [
      createMockPosting({
        account: 'Assets:Checking',
        amount: '100.00',
        currency: 'USD',
      }),
      createMockPosting({
        account: 'Expenses:Food',
        amount: '-100.00',
        currency: 'USD',
      }),
    ],
    tags: [],
    links: new Set<string>(),
    metadata: {},
  }

  const merged = { ...defaults, ...overrides }

  return new Transaction({
    type: 'transaction',
    date: merged.date,
    flag: merged.flag,
    payee: merged.payee,
    narration: merged.narration,
    postings: merged.postings,
    tags: merged.tags,
    links: merged.links,
    metadata: merged.metadata,
  })
}

/**
 * Create a mock posting with sensible defaults
 */
function createMockPosting(
  overrides: Partial<{
    account: string
    amount: string
    currency: string
    cost: unknown
    price: unknown
    metadata: Record<string, Value>
  }> = {},
): Posting {
  const defaults = {
    account: 'Assets:Checking',
    amount: '0',
    currency: 'USD',
  }

  const merged = { ...defaults, ...overrides }

  return new Posting({
    account: merged.account,
    amount: merged.amount,
    currency: merged.currency,
  })
}

/**
 * Create a mock rule with sensible defaults
 */
function createMockRule(
  overrides: Partial<Rule> & { selector: SelectorExpression },
): Rule {
  const defaults: Omit<Rule, 'selector'> = {
    id: 'rule-1',
    name: 'Test Rule',
    description: 'Test rule description',
    enabled: true,
    priority: 100,
    actions: [],
  }

  return { ...defaults, ...overrides } as Rule
}

/**
 * Create account selector
 */
function createAccountSelector(
  pattern: string,
  matchType: 'exact' | 'glob' | 'regex' = 'exact',
): AccountSelector {
  return {
    type: 'account',
    pattern,
    matchType,
  }
}

/**
 * Create narration selector
 */
function createNarrationSelector(
  pattern: string,
  matchType: 'exact' | 'substring' | 'regex' = 'substring',
  caseSensitive = true,
): NarrationSelector {
  return {
    type: 'narration',
    pattern,
    matchType,
    caseSensitive,
  }
}

/**
 * Create payee selector
 */
function createPayeeSelector(
  pattern: string,
  matchType: 'exact' | 'substring' | 'regex' = 'substring',
  caseSensitive = true,
): PayeeSelector {
  return {
    type: 'payee',
    pattern,
    matchType,
    caseSensitive,
  }
}

/**
 * Create amount selector
 */
function createAmountSelector(options: {
  min?: number
  max?: number
  currency?: string
}): AmountSelector {
  return {
    type: 'amount',
    ...options,
  }
}

/**
 * Create date selector
 */
function createDateSelector(options: {
  after?: string
  before?: string
}): DateSelector {
  return {
    type: 'date',
    ...options,
  }
}

/**
 * Create flag selector
 */
function createFlagSelector(flag: string): FlagSelector {
  return {
    type: 'flag',
    flag,
  }
}

/**
 * Create tag selector
 */
function createTagSelector(tag: string): TagSelector {
  return {
    type: 'tag',
    tag,
  }
}

/**
 * Create a tag object
 */
function createTag(content: string): Tag {
  return new Tag({ content, fromStack: false })
}

// ============================================================================
// TESTS: matchesSelector
// ============================================================================

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

// ============================================================================
// TESTS: validateExpectations
// ============================================================================

describe('validateExpectations', () => {
  it('should return empty array when no expectations defined', () => {
    const transaction = createMockTransaction()
    const rule = createMockRule({
      selector: createAccountSelector('Assets:Checking'),
    })

    const warnings = validateExpectations(transaction, rule)

    expect(warnings).toEqual([])
  })

  it('should return empty array when expectations are empty object', () => {
    const transaction = createMockTransaction()
    const rule = createMockRule({
      selector: createAccountSelector('Assets:Checking'),
      expectations: {},
    })

    const warnings = validateExpectations(transaction, rule)

    expect(warnings).toEqual([])
  })

  it('should warn when amount is below minimum', () => {
    const transaction = createMockTransaction({
      postings: [createMockPosting({ amount: '50', currency: 'USD' })],
    })
    const rule = createMockRule({
      selector: createAccountSelector('Assets:Checking'),
      expectations: { minAmount: 100 },
    })

    const warnings = validateExpectations(transaction, rule)

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('below expected minimum')
    expect(warnings[0]).toContain('50')
    expect(warnings[0]).toContain('100')
  })

  it('should warn when amount is above maximum', () => {
    const transaction = createMockTransaction({
      postings: [createMockPosting({ amount: '500', currency: 'USD' })],
    })
    const rule = createMockRule({
      selector: createAccountSelector('Assets:Checking'),
      expectations: { maxAmount: 200 },
    })

    const warnings = validateExpectations(transaction, rule)

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('above expected maximum')
    expect(warnings[0]).toContain('500')
    expect(warnings[0]).toContain('200')
  })

  it('should not warn when amount is within range', () => {
    const transaction = createMockTransaction({
      postings: [createMockPosting({ amount: '100', currency: 'USD' })],
    })
    const rule = createMockRule({
      selector: createAccountSelector('Assets:Checking'),
      expectations: { minAmount: 50, maxAmount: 150 },
    })

    const warnings = validateExpectations(transaction, rule)

    expect(warnings).toEqual([])
  })

  it('should use custom warning message when provided', () => {
    const transaction = createMockTransaction({
      postings: [createMockPosting({ amount: '50', currency: 'USD' })],
    })
    const rule = createMockRule({
      selector: createAccountSelector('Assets:Checking'),
      expectations: {
        minAmount: 100,
      },
    })

    const warnings = validateExpectations(transaction, rule)

    expect(warnings).toEqual([
      'Posting 1: Amount 50 USD is below expected minimum 100',
    ])
  })

  it('should filter by currency when specified', () => {
    const transaction = createMockTransaction({
      postings: [
        createMockPosting({ amount: '50', currency: 'USD' }),
        createMockPosting({ amount: '200', currency: 'EUR' }),
      ],
    })
    const rule = createMockRule({
      selector: createAccountSelector('Assets:Checking'),
      expectations: { minAmount: 100, currency: 'EUR' },
    })

    const warnings = validateExpectations(transaction, rule)

    expect(warnings).toEqual([])
  })

  it('should warn for multiple postings that violate expectations', () => {
    const transaction = createMockTransaction({
      postings: [
        createMockPosting({ amount: '50', currency: 'USD' }),
        createMockPosting({ amount: '30', currency: 'USD' }),
      ],
    })
    const rule = createMockRule({
      selector: createAccountSelector('Assets:Checking'),
      expectations: { minAmount: 100, currency: 'USD' },
    })

    const warnings = validateExpectations(transaction, rule)

    expect(warnings).toHaveLength(2)
  })

  it('should skip postings that do not match currency filter', () => {
    const transaction = createMockTransaction({
      postings: [
        createMockPosting({ amount: '50', currency: 'USD' }),
        createMockPosting({ amount: '200', currency: 'EUR' }),
      ],
    })
    const rule = createMockRule({
      selector: createAccountSelector('Assets:Checking'),
      expectations: { minAmount: 100, currency: 'USD' },
    })

    const warnings = validateExpectations(transaction, rule)

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('USD')
  })

  it('should handle negative amounts correctly', () => {
    const transaction = createMockTransaction({
      postings: [createMockPosting({ amount: '-20', currency: 'USD' })],
    })
    const rule = createMockRule({
      selector: createAccountSelector('Assets:Checking'),
      expectations: { minAmount: -100, maxAmount: -30 },
    })

    const warnings = validateExpectations(transaction, rule)

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('above expected maximum')
  })

  it('should handle postings with no amount', () => {
    const transaction = createMockTransaction({
      postings: [createMockPosting({ amount: '', currency: 'USD' })],
    })
    const rule = createMockRule({
      selector: createAccountSelector('Assets:Checking'),
      expectations: { minAmount: 10 },
    })

    const warnings = validateExpectations(transaction, rule)

    expect(warnings).toHaveLength(1)
  })

  it('should handle transaction with no postings', () => {
    const transaction = createMockTransaction({ postings: [] })
    const rule = createMockRule({
      selector: createAccountSelector('Assets:Checking'),
      expectations: { minAmount: 100 },
    })

    const warnings = validateExpectations(transaction, rule)

    expect(warnings).toEqual([])
  })
})

// ============================================================================
// TESTS: applyAction
// ============================================================================

describe('applyAction', () => {
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

  describe('modify_payee', () => {
    it('should replace payee', () => {
      const transaction = createMockTransaction({ payee: 'Old Payee' })
      const action: Action = {
        type: 'modify_payee',
        operation: 'replace',
        value: 'New Payee',
      }

      applyAction(transaction, action)

      expect(transaction.payee).toBe('New Payee')
    })

    it('should set payee if empty', () => {
      const transaction = createMockTransaction({ payee: undefined })
      const action: Action = {
        type: 'modify_payee',
        operation: 'set_if_empty',
        value: 'Default Payee',
      }

      applyAction(transaction, action)

      expect(transaction.payee).toBe('Default Payee')
    })

    it('should not set payee if not empty with set_if_empty', () => {
      const transaction = createMockTransaction({ payee: 'Existing Payee' })
      const action: Action = {
        type: 'modify_payee',
        operation: 'set_if_empty',
        value: 'Default Payee',
      }

      applyAction(transaction, action)

      expect(transaction.payee).toBe('Existing Payee')
    })

    it('should handle empty string payee with set_if_empty', () => {
      const transaction = createMockTransaction({ payee: '' })
      const action: Action = {
        type: 'modify_payee',
        operation: 'set_if_empty',
        value: 'Default Payee',
      }

      applyAction(transaction, action)

      expect(transaction.payee).toBe('Default Payee')
    })

    describe('variable replacement', () => {
      it('should replace variables in replace operation', () => {
        const transaction = createMockTransaction({
          narration: 'Coffee at Starbucks',
          metadata: {
            merchant: new Value({ type: 'string', value: 'Starbucks Inc.' }),
          },
        })
        const action: Action = {
          type: 'modify_payee',
          operation: 'replace',
          value: '$metadata_merchant',
        }

        applyAction(transaction, action)

        expect(transaction.payee).toBe('Starbucks Inc.')
      })

      it('should replace variables in set_if_empty operation', () => {
        const transaction = createMockTransaction({
          payee: undefined,
          narration: 'Coffee at Starbucks',
        })
        const action: Action = {
          type: 'modify_payee',
          operation: 'set_if_empty',
          value: '$narration',
        }

        applyAction(transaction, action)

        expect(transaction.payee).toBe('Coffee at Starbucks')
      })

      it('should replace posting variables', () => {
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
          type: 'modify_payee',
          operation: 'replace',
          value: 'Payment from $postingAccount[0]',
        }

        applyAction(transaction, action)

        expect(transaction.payee).toBe('Payment from Assets:Checking')
      })

      it('should throw error when variable undefined', () => {
        const transaction = createMockTransaction({
          narration: 'Test',
        })
        const action: Action = {
          type: 'modify_payee',
          operation: 'replace',
          value: '$undefinedVariable',
        }

        expect(() => applyAction(transaction, action)).toThrow(
          "Variable '$undefinedVariable' is not defined",
        )
      })
    })
  })

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
    })
  })

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

        expect(transaction.postings[0].account).toBe(
          'Expenses:Dining:Restaurant',
        )
      })
    })
  })

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

        expect(transaction.metadata!.sourceAccount.value).toBe(
          'Assets:Checking',
        )
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

  describe('add_tag', () => {
    it('should add tag to transaction', () => {
      const transaction = createMockTransaction({ tags: [] })
      const action: Action = {
        type: 'add_tag',
        tag: 'vacation',
      }

      applyAction(transaction, action)

      expect(transaction.tags).toHaveLength(1)
      expect(transaction.tags[0].content).toBe('vacation')
      expect(transaction.tags[0].fromStack).toBe(false)
    })

    it('should not add duplicate tag', () => {
      const transaction = createMockTransaction({
        tags: [createTag('vacation')],
      })
      const action: Action = {
        type: 'add_tag',
        tag: 'vacation',
      }

      applyAction(transaction, action)

      expect(transaction.tags).toHaveLength(1)
    })

    it('should add multiple different tags', () => {
      const transaction = createMockTransaction({ tags: [] })
      const action1: Action = { type: 'add_tag', tag: 'vacation' }
      const action2: Action = { type: 'add_tag', tag: 'travel' }

      applyAction(transaction, action1)
      applyAction(transaction, action2)

      expect(transaction.tags).toHaveLength(2)
      expect(transaction.tags[0].content).toBe('vacation')
      expect(transaction.tags[1].content).toBe('travel')
    })

    describe('variable replacement', () => {
      it('should replace variables in tag name', () => {
        const transaction = createMockTransaction({
          tags: [],
          metadata: {
            category: new Value({ type: 'string', value: 'vacation' }),
          },
        })
        const action: Action = {
          type: 'add_tag',
          tag: '$metadata_category',
        }

        applyAction(transaction, action)

        expect(transaction.tags).toHaveLength(1)
        expect(transaction.tags[0].content).toBe('vacation')
      })

      it('should replace transaction field variables in tag', () => {
        const transaction = createMockTransaction({
          tags: [],
          payee: 'Starbucks',
        })
        const action: Action = {
          type: 'add_tag',
          tag: 'payee-$payee',
        }

        applyAction(transaction, action)

        expect(transaction.tags[0].content).toBe('payee-Starbucks')
      })

      it('should replace posting variables in tag', () => {
        const transaction = createMockTransaction({
          tags: [],
          postings: [
            createMockPosting({
              account: 'Assets:Checking',
              currency: 'USD',
            }),
          ],
        })
        const action: Action = {
          type: 'add_tag',
          tag: 'currency-$postingCurrency[0]',
        }

        applyAction(transaction, action)

        expect(transaction.tags[0].content).toBe('currency-USD')
      })

      it('should throw error for undefined variable', () => {
        const transaction = createMockTransaction({ tags: [] })
        const action: Action = {
          type: 'add_tag',
          tag: '$undefinedVariable',
        }

        expect(() => applyAction(transaction, action)).toThrow(
          "Variable '$undefinedVariable' is not defined",
        )
      })
    })
  })

  describe('add_link', () => {
    it('should add link to transaction', () => {
      const transaction = createMockTransaction({ links: new Set() })
      const action: Action = {
        type: 'add_link',
        link: '^invoice-123',
      }

      applyAction(transaction, action)

      expect(transaction.links.has('^invoice-123')).toBe(true)
    })

    it('should not add duplicate link', () => {
      const transaction = createMockTransaction({
        links: new Set(['^invoice-123']),
      })
      const action: Action = {
        type: 'add_link',
        link: '^invoice-123',
      }

      applyAction(transaction, action)

      expect(transaction.links.size).toBe(1)
    })

    it('should add multiple different links', () => {
      const transaction = createMockTransaction({ links: new Set() })
      const action1: Action = { type: 'add_link', link: '^invoice-123' }
      const action2: Action = { type: 'add_link', link: '^receipt-456' }

      applyAction(transaction, action1)
      applyAction(transaction, action2)

      expect(transaction.links.size).toBe(2)
      expect(transaction.links.has('^invoice-123')).toBe(true)
      expect(transaction.links.has('^receipt-456')).toBe(true)
    })

    describe('variable replacement', () => {
      it('should replace variables in link', () => {
        const transaction = createMockTransaction({
          links: new Set(),
          metadata: {
            invoiceNumber: new Value({ type: 'string', value: 'INV-12345' }),
          },
        })
        const action: Action = {
          type: 'add_link',
          link: '^$metadata_invoiceNumber',
        }

        applyAction(transaction, action)

        expect(transaction.links.has('^INV-12345')).toBe(true)
      })

      it('should create dynamic links from transaction data', () => {
        const transaction = createMockTransaction({
          links: new Set(),
          date: Temporal.PlainDate.from('2024-01-15'),
          payee: 'Acme Corp',
        })
        const action: Action = {
          type: 'add_link',
          link: '^$date-$payee',
        }

        applyAction(transaction, action)

        expect(transaction.links.has('^2024-01-15-Acme Corp')).toBe(true)
      })

      it('should replace posting variables in link', () => {
        const transaction = createMockTransaction({
          links: new Set(),
          postings: [
            createMockPosting({ account: 'Assets:Checking', amount: '100.00' }),
          ],
        })
        const action: Action = {
          type: 'add_link',
          link: '^receipt-$postingAmount[0]',
        }

        applyAction(transaction, action)

        expect(transaction.links.has('^receipt-100.00')).toBe(true)
      })

      it('should throw error for undefined variable', () => {
        const transaction = createMockTransaction({ links: new Set() })
        const action: Action = {
          type: 'add_link',
          link: '^$undefinedVariable',
        }

        expect(() => applyAction(transaction, action)).toThrow(
          "Variable '$undefinedVariable' is not defined",
        )
      })
    })
  })

  describe('add_comment', () => {
    it('should add comment before transaction', () => {
      const transaction = createMockTransaction()
      const action: Action = {
        type: 'add_comment',
        comment: 'This is a test comment',
        position: 'before',
      }

      applyAction(transaction, action)

      expect(transaction.metadata!._comment_before).toBeDefined()
      expect(transaction.metadata!._comment_before.value).toBe(
        'This is a test comment',
      )
    })

    it('should add comment after transaction', () => {
      const transaction = createMockTransaction()
      const action: Action = {
        type: 'add_comment',
        comment: 'This is a test comment',
        position: 'after',
      }

      applyAction(transaction, action)

      expect(transaction.metadata!._comment_after).toBeDefined()
      expect(transaction.metadata!._comment_after.value).toBe(
        'This is a test comment',
      )
    })

    it('should initialize metadata if not exists', () => {
      const transaction = createMockTransaction({ metadata: undefined })
      const action: Action = {
        type: 'add_comment',
        comment: 'Test',
        position: 'before',
      }

      applyAction(transaction, action)

      expect(transaction.metadata).toBeDefined()
    })

    describe('variable replacement', () => {
      it('should replace variables in comment text', () => {
        const transaction = createMockTransaction({
          narration: 'Grocery shopping',
          payee: 'Whole Foods',
        })
        const action: Action = {
          type: 'add_comment',
          comment: 'Transaction: $narration from $payee',
          position: 'before',
        }

        applyAction(transaction, action)

        expect(transaction.metadata!._comment_before.value).toBe(
          'Transaction: Grocery shopping from Whole Foods',
        )
      })

      it('should replace metadata variables in comment', () => {
        const transaction = createMockTransaction({
          metadata: {
            category: new Value({ type: 'string', value: 'Food' }),
            notes: new Value({ type: 'string', value: 'Weekly groceries' }),
          },
        })
        const action: Action = {
          type: 'add_comment',
          comment: 'Category: $metadata_category - $metadata_notes',
          position: 'after',
        }

        applyAction(transaction, action)

        expect(transaction.metadata!._comment_after.value).toBe(
          'Category: Food - Weekly groceries',
        )
      })

      it('should replace posting variables in comment', () => {
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
          type: 'add_comment',
          comment:
            'From $postingAccount[0]: $postingAmount[0] $postingCurrency[0]',
          position: 'before',
        }

        applyAction(transaction, action)

        expect(transaction.metadata!._comment_before.value).toBe(
          'From Assets:Checking: 100.00 USD',
        )
      })

      it('should handle position parameter with variables', () => {
        const transaction = createMockTransaction({
          narration: 'Test transaction',
        })
        const action: Action = {
          type: 'add_comment',
          comment: 'Note: $narration',
          position: 'before',
        }

        applyAction(transaction, action)

        expect(transaction.metadata!._comment_before.value).toBe(
          'Note: Test transaction',
        )
      })

      it('should throw error for undefined variable', () => {
        const transaction = createMockTransaction()
        const action: Action = {
          type: 'add_comment',
          comment: '$undefinedVariable',
          position: 'before',
        }

        expect(() => applyAction(transaction, action)).toThrow(
          "Variable '$undefinedVariable' is not defined",
        )
      })
    })
  })

  describe('set_flag', () => {
    it('should set transaction flag', () => {
      const transaction = createMockTransaction({ flag: '*' })
      const action: Action = {
        type: 'set_flag',
        flag: '!',
      }

      applyAction(transaction, action)

      expect(transaction.flag).toBe('!')
    })

    it('should change flag from cleared to pending', () => {
      const transaction = createMockTransaction({ flag: '*' })
      const action: Action = {
        type: 'set_flag',
        flag: '!',
      }

      applyAction(transaction, action)

      expect(transaction.flag).toBe('!')
    })

    it('should set custom flag', () => {
      const transaction = createMockTransaction({ flag: '*' })
      const action: Action = {
        type: 'set_flag',
        flag: 'P',
      }

      applyAction(transaction, action)

      expect(transaction.flag).toBe('P')
    })
  })

  describe('set_output_file', () => {
    it('should set outputFile in internalMetadata', () => {
      const transaction = createMockTransaction()
      const action: Action = {
        type: 'set_output_file',
        outputFile: '/path/to/output.beancount',
      }

      applyAction(transaction, action)

      expect(transaction.internalMetadata).toBeDefined()
      expect(
        (transaction.internalMetadata as Record<string, unknown> | undefined)
          ?.outputFile,
      ).toBe('/path/to/output.beancount')
    })

    it('should overwrite existing outputFile', () => {
      const transaction = createMockTransaction()
      transaction.internalMetadata = {
        outputFile: '/old/path.beancount',
      }
      const action: Action = {
        type: 'set_output_file',
        outputFile: '/new/path.beancount',
      }

      applyAction(transaction, action)

      expect(
        (transaction.internalMetadata as Record<string, unknown> | undefined)
          ?.outputFile,
      ).toBe('/new/path.beancount')
    })

    it('should preserve other internalMetadata properties', () => {
      const transaction = createMockTransaction()
      transaction.internalMetadata = {
        customProperty: 'test-value',
        anotherProperty: 123,
      }
      const action: Action = {
        type: 'set_output_file',
        outputFile: '/path/to/output.beancount',
      }

      applyAction(transaction, action)

      expect(
        (transaction.internalMetadata as Record<string, unknown> | undefined)
          ?.outputFile,
      ).toBe('/path/to/output.beancount')
      expect(
        (transaction.internalMetadata as Record<string, unknown> | undefined)
          ?.customProperty,
      ).toBe('test-value')
      expect(
        (transaction.internalMetadata as Record<string, unknown> | undefined)
          ?.anotherProperty,
      ).toBe(123)
    })

    it('should handle empty outputFile string', () => {
      const transaction = createMockTransaction()
      const action: Action = {
        type: 'set_output_file',
        outputFile: '',
      }

      applyAction(transaction, action)

      expect(
        (transaction.internalMetadata as Record<string, unknown> | undefined)
          ?.outputFile,
      ).toBe('')
    })

    it('should handle paths with spaces', () => {
      const transaction = createMockTransaction()
      const action: Action = {
        type: 'set_output_file',
        outputFile: '/path with spaces/my output.beancount',
      }

      applyAction(transaction, action)

      expect(
        (transaction.internalMetadata as Record<string, unknown> | undefined)
          ?.outputFile,
      ).toBe('/path with spaces/my output.beancount')
    })

    it('should handle Windows-style paths', () => {
      const transaction = createMockTransaction()
      const action: Action = {
        type: 'set_output_file',
        outputFile: 'C:\\Users\\Documents\\output.beancount',
      }

      applyAction(transaction, action)

      expect(
        (transaction.internalMetadata as Record<string, unknown> | undefined)
          ?.outputFile,
      ).toBe('C:\\Users\\Documents\\output.beancount')
    })

    it('should be applied when rule matches', () => {
      const transaction = createMockTransaction({
        narration: 'Test transaction',
      })
      const rule = createMockRule({
        selector: createNarrationSelector('Test', 'substring'),
        actions: [
          {
            type: 'set_output_file',
            outputFile: '/custom/output.beancount',
          },
        ],
      })

      const result = processTransaction(transaction, [rule])

      expect(result.matchedRules).toHaveLength(1)
      expect(result.matchedRules[0].actionsApplied).toContain('set_output_file')
      expect(
        (transaction.internalMetadata as Record<string, unknown> | undefined)
          ?.outputFile,
      ).toBe('/custom/output.beancount')
    })

    it('should allow multiple rules to change outputFile', () => {
      const transaction = createMockTransaction({
        narration: 'Test transaction',
      })
      const rule1 = createMockRule({
        id: 'rule-1',
        name: 'Rule 1',
        priority: 10,
        selector: createNarrationSelector('Test', 'substring'),
        actions: [
          {
            type: 'set_output_file',
            outputFile: '/first/output.beancount',
          },
        ],
      })
      const rule2 = createMockRule({
        id: 'rule-2',
        name: 'Rule 2',
        priority: 5,
        selector: createNarrationSelector('Test', 'substring'),
        actions: [
          {
            type: 'set_output_file',
            outputFile: '/second/output.beancount',
          },
        ],
      })

      const result = processTransaction(transaction, [rule1, rule2])

      expect(result.matchedRules).toHaveLength(2)
      // Last rule wins (lower priority runs later)
      expect(
        (transaction.internalMetadata as Record<string, unknown> | undefined)
          ?.outputFile,
      ).toBe('/second/output.beancount')
    })

    it('should work with relative paths', () => {
      const transaction = createMockTransaction()
      const action: Action = {
        type: 'set_output_file',
        outputFile: './relative/path/output.beancount',
      }

      applyAction(transaction, action)

      expect(
        (transaction.internalMetadata as Record<string, unknown> | undefined)
          ?.outputFile,
      ).toBe('./relative/path/output.beancount')
    })

    it('should work with just a filename', () => {
      const transaction = createMockTransaction()
      const action: Action = {
        type: 'set_output_file',
        outputFile: 'output.beancount',
      }

      applyAction(transaction, action)

      expect(
        (transaction.internalMetadata as Record<string, unknown> | undefined)
          ?.outputFile,
      ).toBe('output.beancount')
    })

    describe('variable replacement', () => {
      it('should replace variables in outputFile path', () => {
        const transaction = createMockTransaction({
          metadata: {
            category: new Value({ type: 'string', value: 'Food' }),
          },
        })
        const action: Action = {
          type: 'set_output_file',
          outputFile: '/output/$metadata_category.beancount',
        }

        applyAction(transaction, action)

        expect(
          (transaction.internalMetadata as Record<string, unknown> | undefined)
            ?.outputFile,
        ).toBe('/output/Food.beancount')
      })

      it('should create dynamic paths based on transaction data', () => {
        const transaction = createMockTransaction({
          date: Temporal.PlainDate.from('2024-01-15'),
          payee: 'Starbucks',
        })
        const action: Action = {
          type: 'set_output_file',
          outputFile: '/transactions/$date/$payee.beancount',
        }

        applyAction(transaction, action)

        expect(
          (transaction.internalMetadata as Record<string, unknown> | undefined)
            ?.outputFile,
        ).toBe('/transactions/2024-01-15/Starbucks.beancount')
      })

      it('should support date-based file organization', () => {
        const transaction = createMockTransaction({
          date: Temporal.PlainDate.from('2024-03-15'),
        })
        const action: Action = {
          type: 'set_output_file',
          outputFile: '/output/$date.beancount',
        }

        applyAction(transaction, action)

        expect(
          (transaction.internalMetadata as Record<string, unknown> | undefined)
            ?.outputFile,
        ).toBe('/output/2024-03-15.beancount')
      })

      it('should replace posting variables in path', () => {
        const transaction = createMockTransaction({
          postings: [
            createMockPosting({
              account: 'Assets:Checking',
              currency: 'USD',
            }),
          ],
        })
        const action: Action = {
          type: 'set_output_file',
          outputFile: '/output/$postingCurrency[0]/transactions.beancount',
        }

        applyAction(transaction, action)

        expect(
          (transaction.internalMetadata as Record<string, unknown> | undefined)
            ?.outputFile,
        ).toBe('/output/USD/transactions.beancount')
      })

      it('should handle complex path expressions', () => {
        const transaction = createMockTransaction({
          date: Temporal.PlainDate.from('2024-01-15'),
          metadata: {
            category: new Value({ type: 'string', value: 'Food' }),
            subcategory: new Value({ type: 'string', value: 'Groceries' }),
          },
        })
        const action: Action = {
          type: 'set_output_file',
          outputFile:
            '/output/$date/$metadata_category/$metadata_subcategory.beancount',
        }

        applyAction(transaction, action)

        expect(
          (transaction.internalMetadata as Record<string, unknown> | undefined)
            ?.outputFile,
        ).toBe('/output/2024-01-15/Food/Groceries.beancount')
      })

      it('should handle narration in filename', () => {
        const transaction = createMockTransaction({
          narration: 'Weekly Groceries',
        })
        const action: Action = {
          type: 'set_output_file',
          outputFile: '/output/$narration.beancount',
        }

        applyAction(transaction, action)

        expect(
          (transaction.internalMetadata as Record<string, unknown> | undefined)
            ?.outputFile,
        ).toBe('/output/Weekly Groceries.beancount')
      })

      it('should throw error for undefined variable', () => {
        const transaction = createMockTransaction()
        const action: Action = {
          type: 'set_output_file',
          outputFile: '/output/$undefinedVariable.beancount',
        }

        expect(() => applyAction(transaction, action)).toThrow(
          "Variable '$undefinedVariable' is not defined",
        )
      })
    })
  })
})

// ============================================================================
// TESTS: buildVariablesFromTransaction
// ============================================================================

describe('buildVariablesFromTransaction', () => {
  describe('basic transaction fields', () => {
    it('should extract narration', () => {
      const transaction = createMockTransaction({
        narration: 'Grocery shopping',
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.narration).toBe('Grocery shopping')
    })

    it('should extract payee', () => {
      const transaction = createMockTransaction({
        payee: 'Whole Foods',
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.payee).toBe('Whole Foods')
    })

    it('should extract date as string', () => {
      const transaction = createMockTransaction({
        date: '2024-01-15',
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.date).toBe('2024-01-15')
    })

    it('should extract flag', () => {
      const transaction = createMockTransaction({
        flag: '*',
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.flag).toBe('*')
    })

    it('should handle empty narration', () => {
      const transaction = createMockTransaction({
        narration: '',
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.narration).toBe('')
    })

    it('should handle missing payee', () => {
      const transaction = createMockTransaction({
        payee: undefined,
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.payee).toBe('')
    })
  })

  describe('posting data arrays', () => {
    it('should extract posting amounts with indices', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ amount: '100.00' }),
          createMockPosting({ amount: '-100.00' }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['postingAmount[0]']).toBe('100.00')
      expect(variables['postingAmount[1]']).toBe('-100.00')
    })

    it('should extract posting accounts with indices', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ account: 'Assets:Checking' }),
          createMockPosting({ account: 'Expenses:Food' }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['postingAccount[0]']).toBe('Assets:Checking')
      expect(variables['postingAccount[1]']).toBe('Expenses:Food')
    })

    it('should extract posting currencies with indices', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ currency: 'USD' }),
          createMockPosting({ currency: 'EUR' }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['postingCurrency[0]']).toBe('USD')
      expect(variables['postingCurrency[1]']).toBe('EUR')
    })

    it('should handle transaction with single posting', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({
            account: 'Assets:Checking',
            amount: '50.00',
          }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['postingAccount[0]']).toBe('Assets:Checking')
      expect(variables['postingAmount[0]']).toBe('50.00')
    })

    it('should handle transaction with many postings', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ amount: '10.00' }),
          createMockPosting({ amount: '20.00' }),
          createMockPosting({ amount: '30.00' }),
          createMockPosting({ amount: '-60.00' }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['postingAmount[0]']).toBe('10.00')
      expect(variables['postingAmount[1]']).toBe('20.00')
      expect(variables['postingAmount[2]']).toBe('30.00')
      expect(variables['postingAmount[3]']).toBe('-60.00')
    })

    it('should handle posting with empty amount', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ amount: '', account: 'Assets:Checking' }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['postingAmount[0]']).toBe('')
    })

    it('should handle posting with empty account', () => {
      const transaction = createMockTransaction({
        postings: [createMockPosting({ account: '', amount: '100.00' })],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['postingAccount[0]']).toBe('')
    })

    it('should handle transaction with no postings', () => {
      const transaction = createMockTransaction({
        postings: [],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.narration).toBe('Test Narration')
      expect(variables['postingAmount[0]']).toBeUndefined()
    })
  })

  describe('metadata extraction', () => {
    it('should extract string metadata with prefix', () => {
      const transaction = createMockTransaction({
        metadata: {
          category: new Value({ type: 'string', value: 'groceries' }),
        },
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.metadata_category).toBe('groceries')
    })

    it('should extract number metadata as string', () => {
      const transaction = createMockTransaction({
        metadata: {
          quantity: new Value({ type: 'numbers', value: 42 }),
        },
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.metadata_quantity).toBe('42')
    })

    it('should extract boolean metadata as string', () => {
      const transaction = createMockTransaction({
        metadata: {
          reviewed: new Value({ type: 'boolean', value: true }),
        },
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.metadata_reviewed).toBe('true')
    })

    it('should handle multiple metadata entries', () => {
      const transaction = createMockTransaction({
        metadata: {
          category: new Value({ type: 'string', value: 'groceries' }),
          store: new Value({ type: 'string', value: 'Whole Foods' }),
          invoiceNumber: new Value({ type: 'string', value: 'INV-123' }),
        },
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.metadata_category).toBe('groceries')
      expect(variables.metadata_store).toBe('Whole Foods')
      expect(variables.metadata_invoiceNumber).toBe('INV-123')
    })

    it('should handle metadata with special characters in key', () => {
      const transaction = createMockTransaction({
        metadata: {
          'custom-field-name': new Value({
            type: 'string',
            value: 'test-value',
          }),
        },
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['metadata_custom-field-name']).toBe('test-value')
    })

    it('should handle transaction with no metadata', () => {
      const transaction = createMockTransaction({
        metadata: {},
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.narration).toBe('Test Narration')
      expect(variables.metadata_anything).toBeUndefined()
    })

    it('should handle empty string metadata value', () => {
      const transaction = createMockTransaction({
        metadata: {
          note: new Value({ type: 'string', value: '' }),
        },
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.metadata_note).toBe('')
    })
  })

  describe('comprehensive extraction', () => {
    it('should extract all variable types in single transaction', () => {
      const transaction = createMockTransaction({
        narration: 'Original Narration',
        payee: 'Test Payee',
        date: '2024-01-15',
        flag: '*',
        postings: [
          createMockPosting({
            account: 'Assets:Checking',
            amount: '100.00',
            currency: 'USD',
          }),
          createMockPosting({
            account: 'Expenses:Food',
            amount: '-100.00',
            currency: 'USD',
          }),
        ],
        metadata: {
          category: new Value({ type: 'string', value: 'groceries' }),
        },
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.narration).toBe('Original Narration')
      expect(variables.payee).toBe('Test Payee')
      expect(variables.date).toBe('2024-01-15')
      expect(variables.flag).toBe('*')
      expect(variables['postingAmount[0]']).toBe('100.00')
      expect(variables['postingAccount[0]']).toBe('Assets:Checking')
      expect(variables['postingCurrency[0]']).toBe('USD')
      expect(variables['postingAmount[1]']).toBe('-100.00')
      expect(variables['postingAccount[1]']).toBe('Expenses:Food')
      expect(variables['postingCurrency[1]']).toBe('USD')
      expect(variables.metadata_category).toBe('groceries')
    })

    it('should handle transaction with minimal data', () => {
      const transaction = createMockTransaction({
        narration: 'Test',
        postings: [],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.narration).toBe('Test')
      expect(variables.payee).toBe('Test Payee') // Default from createMockTransaction
      expect(variables.date).toBeTruthy()
      expect(variables.flag).toBeTruthy()
    })
  })
})

// ============================================================================
// TESTS: processTransaction
// ============================================================================

describe('processTransaction', () => {
  it('should return empty results when no rules provided', () => {
    const transaction = createMockTransaction()

    const result = processTransaction(transaction, [])

    expect(result.matchedRules).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('should apply matching rule', () => {
    const transaction = createMockTransaction({ narration: 'Test' })
    const rule = createMockRule({
      selector: createNarrationSelector('Test', 'substring'),
      actions: [
        {
          type: 'modify_narration',
          operation: 'append',
          value: ' - processed',
        },
      ],
    })

    const result = processTransaction(transaction, [rule])

    expect(result.matchedRules).toHaveLength(1)
    expect(result.matchedRules[0].ruleId).toBe('rule-1')
    expect(result.matchedRules[0].actionsApplied).toEqual(['modify_narration'])
    expect(transaction.narration).toBe('Test - processed')
  })

  it('should skip non-matching rule', () => {
    const transaction = createMockTransaction({ narration: 'Test' })
    const rule = createMockRule({
      selector: createNarrationSelector('Other', 'substring'),
      actions: [
        {
          type: 'modify_narration',
          operation: 'append',
          value: ' - processed',
        },
      ],
    })

    const result = processTransaction(transaction, [rule])

    expect(result.matchedRules).toHaveLength(0)
    expect(transaction.narration).toBe('Test')
  })

  it('should skip disabled rules', () => {
    const transaction = createMockTransaction({ narration: 'Test' })
    const rule = createMockRule({
      selector: createNarrationSelector('Test', 'substring'),
      enabled: false,
      actions: [
        {
          type: 'modify_narration',
          operation: 'append',
          value: ' - processed',
        },
      ],
    })

    const result = processTransaction(transaction, [rule])

    expect(result.matchedRules).toHaveLength(0)
    expect(transaction.narration).toBe('Test')
  })

  it('should apply multiple matching rules in priority order', () => {
    const transaction = createMockTransaction({ narration: 'Test' })
    const rule1 = createMockRule({
      id: 'rule-1',
      name: 'Rule 1',
      selector: createNarrationSelector('Test', 'substring'),
      priority: 100,
      actions: [
        {
          type: 'modify_narration',
          operation: 'append',
          value: ' - first',
        },
      ],
    })
    const rule2 = createMockRule({
      id: 'rule-2',
      name: 'Rule 2',
      selector: createNarrationSelector('Test', 'substring'),
      priority: 200,
      actions: [
        {
          type: 'modify_narration',
          operation: 'append',
          value: ' - second',
        },
      ],
    })

    const result = processTransaction(transaction, [rule1, rule2])

    expect(result.matchedRules).toHaveLength(2)
    expect(result.matchedRules[0].ruleId).toBe('rule-2') // Higher priority first
    expect(result.matchedRules[1].ruleId).toBe('rule-1')
    expect(transaction.narration).toBe('Test - second - first')
  })

  it('should collect warnings from expectations', () => {
    const transaction = createMockTransaction({
      postings: [createMockPosting({ amount: '50', currency: 'USD' })],
    })
    const rule = createMockRule({
      selector: createNarrationSelector('Test', 'substring'),
      expectations: {
        minAmount: 100,
      },
      actions: [],
    })

    const result = processTransaction(transaction, [rule])

    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toBe(
      'Posting 1: Amount 50 USD is below expected minimum 100',
    )
  })

  it('should apply multiple actions from a single rule', () => {
    const transaction = createMockTransaction({
      narration: 'Test',
      payee: 'Old Payee',
    })
    const rule = createMockRule({
      selector: createNarrationSelector('Test', 'substring'),
      actions: [
        {
          type: 'modify_narration',
          operation: 'append',
          value: ' - modified',
        },
        {
          type: 'modify_payee',
          operation: 'replace',
          value: 'New Payee',
        },
        {
          type: 'add_tag',
          tag: 'processed',
        },
      ],
    })

    const result = processTransaction(transaction, [rule])

    expect(result.matchedRules).toHaveLength(1)
    expect(result.matchedRules[0].actionsApplied).toEqual([
      'modify_narration',
      'modify_payee',
      'add_tag',
    ])
    expect(transaction.narration).toBe('Test - modified')
    expect(transaction.payee).toBe('New Payee')
    expect(transaction.tags).toHaveLength(1)
    expect(transaction.tags[0].content).toBe('processed')
  })

  it('should handle rules with no actions', () => {
    const transaction = createMockTransaction()
    const rule = createMockRule({
      selector: createNarrationSelector('Test', 'substring'),
      actions: [],
    })

    const result = processTransaction(transaction, [rule])

    expect(result.matchedRules).toHaveLength(1)
    expect(result.matchedRules[0].actionsApplied).toEqual([])
  })

  it('should process rules sequentially and maintain state', () => {
    const transaction = createMockTransaction({ narration: 'Grocery' })
    const rule1 = createMockRule({
      id: 'rule-1',
      selector: createNarrationSelector('Grocery', 'substring'),
      priority: 200,
      actions: [
        {
          type: 'add_tag',
          tag: 'food',
        },
      ],
    })
    const rule2 = createMockRule({
      id: 'rule-2',
      selector: createTagSelector('food'),
      priority: 100,
      actions: [
        {
          type: 'modify_narration',
          operation: 'append',
          value: ' [food category]',
        },
      ],
    })

    const result = processTransaction(transaction, [rule1, rule2])

    expect(result.matchedRules).toHaveLength(2)
    expect(transaction.tags[0].content).toBe('food')
    expect(transaction.narration).toBe('Grocery [food category]')
  })
})

// ============================================================================
// TESTS: processImportWithRules
// ============================================================================

describe('processImportWithRules', () => {
  it('should process all transactions in parse result', () => {
    const parseResult = new ParseResult([
      createMockTransaction({ narration: 'Transaction 1' }),
      createMockTransaction({ narration: 'Transaction 2' }),
    ])
    const rule = createMockRule({
      selector: createNarrationSelector('Transaction', 'substring'),
      actions: [
        {
          type: 'add_tag',
          tag: 'processed',
        },
      ],
    })

    const result = processImportWithRules(parseResult, [rule])

    expect(result.executionDetails).toHaveLength(2)
    expect(result.statistics.totalTransactions).toBe(2)
    expect(result.statistics.transactionsProcessed).toBe(2)
    expect(result.statistics.rulesApplied).toBe(2)
  })

  it('should skip non-transaction entries', () => {
    const parseResult = new ParseResult([
      createMockTransaction({ narration: 'Transaction 1' }),
      { type: 'balance', account: 'Assets:Checking' } as unknown as Entry,
      createMockTransaction({ narration: 'Transaction 2' }),
    ])
    const rule = createMockRule({
      selector: createNarrationSelector('Transaction', 'substring'),
      actions: [{ type: 'add_tag', tag: 'processed' }],
    })

    const result = processImportWithRules(parseResult, [rule])

    // executionDetails only includes transaction entries, not other entry types
    expect(result.executionDetails).toHaveLength(2)
    expect(result.statistics.totalTransactions).toBe(2)
    expect(result.statistics.transactionsProcessed).toBe(2)
  })

  it('should track execution details for each transaction', () => {
    const parseResult = new ParseResult([
      createMockTransaction({
        date: '2024-01-15',
        narration: 'Coffee',
      }),
    ])
    const rule = createMockRule({
      id: 'rule-123',
      name: 'Coffee Rule',
      selector: createNarrationSelector('Coffee', 'substring'),
      actions: [{ type: 'add_tag', tag: 'beverage' }],
    })

    const result = processImportWithRules(parseResult, [rule])

    expect(result.executionDetails).toHaveLength(1)
    expect(result.executionDetails[0]).toEqual({
      transactionIndex: 0,
      transactionDate: '2024-01-15',
      transactionNarration: 'Coffee',
      matchedRules: [
        {
          ruleId: 'rule-123',
          ruleName: 'Coffee Rule',
          actionsApplied: ['add_tag'],
        },
      ],
      warnings: [],
    })
  })

  it('should collect warnings across all transactions', () => {
    const parseResult = new ParseResult([
      createMockTransaction({
        postings: [createMockPosting({ amount: '50', currency: 'USD' })],
      }),
      createMockTransaction({
        postings: [createMockPosting({ amount: '30', currency: 'USD' })],
      }),
    ])
    const rule = createMockRule({
      selector: createNarrationSelector('Test', 'substring'),
      expectations: {
        minAmount: 100,
      },
      actions: [],
    })

    const result = processImportWithRules(parseResult, [rule])

    expect(result.statistics.warningsGenerated).toBe(2)
    expect(result.executionDetails[0].warnings).toContain(
      'Posting 1: Amount 50 USD is below expected minimum 100',
    )
    expect(result.executionDetails[1].warnings).toContain(
      'Posting 1: Amount 30 USD is below expected minimum 100',
    )
  })

  it('should calculate statistics correctly', () => {
    const parseResult = new ParseResult([
      createMockTransaction({ narration: 'Match' }),
      createMockTransaction({ narration: 'No match' }),
      createMockTransaction({ narration: 'Match again' }),
    ])
    const rule = createMockRule({
      selector: createNarrationSelector('Match', 'substring'),
      actions: [{ type: 'add_tag', tag: 'matched' }],
    })

    const result = processImportWithRules(parseResult, [rule])

    expect(result.statistics.totalTransactions).toBe(3)
    expect(result.statistics.transactionsProcessed).toBe(2)
    expect(result.statistics.rulesApplied).toBe(2)
    expect(result.statistics.warningsGenerated).toBe(0)
  })

  it('should handle empty parse result', () => {
    const parseResult = new ParseResult([])
    const rule = createMockRule({
      selector: createNarrationSelector('Test', 'substring'),
      actions: [],
    })

    const result = processImportWithRules(parseResult, [rule])

    expect(result.executionDetails).toHaveLength(0)
    expect(result.statistics.totalTransactions).toBe(0)
    expect(result.statistics.transactionsProcessed).toBe(0)
    expect(result.statistics.rulesApplied).toBe(0)
  })

  it('should handle parse result with no rules', () => {
    const parseResult = new ParseResult([
      createMockTransaction({ narration: 'Test 1' }),
      createMockTransaction({ narration: 'Test 2' }),
    ])

    const result = processImportWithRules(parseResult, [])

    expect(result.statistics.totalTransactions).toBe(2)
    expect(result.statistics.transactionsProcessed).toBe(0)
    expect(result.statistics.rulesApplied).toBe(0)
  })

  it('should count multiple rules applied to same transaction', () => {
    const parseResult = new ParseResult([
      createMockTransaction({ narration: 'Test' }),
    ])
    const rule1 = createMockRule({
      id: 'rule-1',
      selector: createNarrationSelector('Test', 'substring'),
      actions: [{ type: 'add_tag', tag: 'tag1' }],
    })
    const rule2 = createMockRule({
      id: 'rule-2',
      selector: createNarrationSelector('Test', 'substring'),
      actions: [{ type: 'add_tag', tag: 'tag2' }],
    })

    const result = processImportWithRules(parseResult, [rule1, rule2])

    expect(result.statistics.transactionsProcessed).toBe(1)
    expect(result.statistics.rulesApplied).toBe(2)
  })

  it('should modify transactions in-place', () => {
    const transaction1 = createMockTransaction({ narration: 'Test 1' })
    const transaction2 = createMockTransaction({ narration: 'Test 2' })
    const parseResult = new ParseResult([transaction1, transaction2])
    const rule = createMockRule({
      selector: createNarrationSelector('Test', 'substring'),
      actions: [{ type: 'add_tag', tag: 'modified' }],
    })

    processImportWithRules(parseResult, [rule])

    // Verify original transaction objects were modified
    expect(transaction1.tags).toHaveLength(1)
    expect(transaction1.tags[0].content).toBe('modified')
    expect(transaction2.tags).toHaveLength(1)
    expect(transaction2.tags[0].content).toBe('modified')
  })
})
