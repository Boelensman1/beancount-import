/**
 * Test utilities for rule engine tests
 */
import crypto from 'crypto'
import { vi, describe, it, expect } from 'vitest'
import { Temporal } from '@js-temporal/polyfill'
import { Transaction, Posting, Tag, Value } from 'beancount'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
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
  NeverSelector,
  Account,
  ProcessedTransaction,
} from '@/lib/db/types'

/**
 * Create a QueryClient configured for testing
 * - No retries to make tests faster and more predictable
 * - No caching between tests
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

/**
 * Create a wrapper component for testing hooks
 */
export function createQueryClientWrapper() {
  const queryClient = createTestQueryClient()
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

/**
 * Render a component with QueryClientProvider for testing
 * Returns the render result plus the queryClient for inspection/manipulation
 */
export function renderWithQueryClient(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  const queryClient = createTestQueryClient()
  return {
    ...render(ui, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
      ...options,
    }),
    queryClient,
  }
}

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
    allowManualSelection: false,
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
 * Create never selector (never matches)
 */
export function createNeverSelector(): NeverSelector {
  return {
    type: 'never',
  }
}

/**
 * Create a tag object
 */
export function createTag(content: string): Tag {
  return new Tag({ content, fromStack: false })
}

/**
 * Create a mock GoCardless account configuration
 */
export function createMockGoCardlessConfig(
  overrides: Partial<{
    countryCode: string
    bankId: string
    reqRef: string
    accounts: string[]
    importedTill: Temporal.PlainDate
    endUserAgreementValidTill: Temporal.Instant
    reversePayee: boolean
  }> = {},
): {
  countryCode: string
  bankId: string
  reqRef: string
  accounts: string[]
  importedTill: Temporal.PlainDate
  endUserAgreementValidTill: Temporal.Instant
  reversePayee: boolean
} {
  const defaults = {
    countryCode: 'GB',
    bankId: 'SANDBOXFINANCE_SFIN0000',
    reqRef: 'test-requisition-ref-123',
    accounts: [crypto.randomUUID(), crypto.randomUUID()],
    importedTill: Temporal.PlainDate.from('2024-11-01'),
    endUserAgreementValidTill: Temporal.Instant.from('2025-11-01T00:00:00Z'),
    reversePayee: false,
  }

  return { ...defaults, ...overrides }
}

/**
 * Create a mock Account with GoCardless configuration
 */
export function createMockAccount(
  overrides: Partial<{
    id: string
    name: string
    importerCommand: string
    defaultOutputFile: string
    rules: Rule[]
    variables: {
      id: string
      name: string
      value: string
      description?: string
    }[]
    goCardless: ReturnType<typeof createMockGoCardlessConfig>
  }> = {},
): Account {
  const defaults = {
    id: crypto.randomUUID(),
    name: 'Test Account',
    csvFilename: 'csv.csv',
    defaultOutputFile: 'test.beancount',
    rules: [],
    variables: [],
    goCardless: createMockGoCardlessConfig(),
  }

  return { ...defaults, ...overrides } as Account
}

/**
 * Create a mock ProcessedTransaction with sensible defaults
 */
export function createMockProcessedTransaction(
  overrides: Partial<ProcessedTransaction> = {},
): ProcessedTransaction {
  const defaults: ProcessedTransaction = {
    id: crypto.randomUUID(),
    originalTransaction: JSON.stringify(createMockTransaction().toJSON()),
    processedEntries: JSON.stringify([createMockTransaction().toJSON()]),
    matchedRules: [],
    warnings: [],
    skippedRuleIds: [],
  }

  return { ...defaults, ...overrides }
}

/**
 * Standard test IDs for use across test files
 * Using valid UUIDs with predictable prefixes for different entity types
 */
export const TEST_IDS = {
  ACCOUNT_1: '00000000-0000-4000-8000-000000000001',
  ACCOUNT_2: '00000000-0000-4000-8000-000000000002',
  BATCH_1: '10000000-0000-4000-8000-000000000001',
  BATCH_2: '10000000-0000-4000-8000-000000000002',
  IMPORT_1: '20000000-0000-4000-8000-000000000001',
  IMPORT_2: '20000000-0000-4000-8000-000000000002',
  TRANSACTION_1: '30000000-0000-4000-8000-000000000001',
  TRANSACTION_2: '30000000-0000-4000-8000-000000000002',
  RULE_1: '40000000-0000-4000-8000-000000000001',
  RULE_2: '40000000-0000-4000-8000-000000000002',
} as const

/**
 * Read a ReadableStream to completion and return the full string
 */
export async function readStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let result = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value, { stream: true })
  }

  return result
}

/**
 * Create mock callback functions commonly used in component tests
 * Returns callbacks and a reset function for beforeEach
 */
export function createMockCallbacks() {
  const callbacks = {
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onChange: vi.fn(),
    onSubmit: vi.fn(),
  }

  const reset = () => {
    Object.values(callbacks).forEach((fn) => fn.mockClear())
  }

  return { callbacks, reset }
}

/**
 * Helper to create tests for variable replacement in action tests.
 * This reduces boilerplate across action test files.
 *
 * @param applyAction - The action application function
 * @param createAction - Factory to create an action with a given value string
 * @param getResultValue - Extractor to get the resulting value from the result
 *
 * @example
 * ```ts
 * describeVariableReplacement(
 *   applyAction,
 *   (value) => ({ type: 'add_tag', tag: value }),
 *   (result) => result[0].tags[0].content
 * )
 * ```
 */
export function describeVariableReplacement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  applyAction: (transaction: Transaction, action: any) => any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createAction: (value: string) => any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getResultValue: (result: any[]) => string,
) {
  describe('variable replacement', () => {
    it('should replace $payee variable', () => {
      const transaction = createMockTransaction({
        payee: 'Test Payee Value',
      })
      const action = createAction('prefix-$payee-suffix')
      const result = applyAction(transaction, action)
      expect(getResultValue(result)).toBe('prefix-Test Payee Value-suffix')
    })

    it('should replace $narration variable', () => {
      const transaction = createMockTransaction({
        narration: 'Test Narration Value',
      })
      const action = createAction('$narration')
      const result = applyAction(transaction, action)
      expect(getResultValue(result)).toBe('Test Narration Value')
    })

    it('should replace metadata variables', () => {
      const transaction = createMockTransaction({
        metadata: {
          category: new Value({ type: 'string', value: 'groceries' }),
        },
      })
      const action = createAction('$metadata_category')
      const result = applyAction(transaction, action)
      expect(getResultValue(result)).toBe('groceries')
    })

    it('should replace posting array variables', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ account: 'Assets:Checking', currency: 'USD' }),
        ],
      })
      const action = createAction('$postingCurrency[0]')
      const result = applyAction(transaction, action)
      expect(getResultValue(result)).toBe('USD')
    })

    it('should throw error for undefined variable', () => {
      const transaction = createMockTransaction()
      const action = createAction('$undefinedVariable')
      expect(() => applyAction(transaction, action)).toThrow(
        "Variable '$undefinedVariable' is not defined",
      )
    })
  })
}
