/**
 * Test utilities for rule engine tests
 */
import { Temporal } from '@js-temporal/polyfill'
import { Transaction, Posting, Tag, Value } from 'beancount'
import type {
  Rule,
  SelectorExpression,
  AccountSelector,
  NarrationSelector,
  PayeeSelector,
  AmountSelector,
  DateSelector,
  FlagSelector,
  TagSelector,
} from '@/lib/db/types'

/**
 * Create a mock transaction with sensible defaults
 */
export function createMockTransaction(
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
export function createMockPosting(
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
export function createMockRule(
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
export function createAccountSelector(
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
export function createNarrationSelector(
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
export function createPayeeSelector(
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
export function createAmountSelector(options: {
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
export function createDateSelector(options: {
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
export function createFlagSelector(flag: string): FlagSelector {
  return {
    type: 'flag',
    flag,
  }
}

/**
 * Create tag selector
 */
export function createTagSelector(tag: string): TagSelector {
  return {
    type: 'tag',
    tag,
  }
}

/**
 * Create a tag object
 */
export function createTag(content: string): Tag {
  return new Tag({ content, fromStack: false })
}
