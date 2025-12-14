/**
 * Tests for rule processing and validation logic
 */
import { describe, it, expect } from 'vitest'
import { ParseResult, type Entry } from 'beancount'
import {
  createMockTransaction,
  createMockPosting,
  createMockRule,
  createAccountSelector,
  createNarrationSelector,
  createTagSelector,
} from '@/test/test-utils'

import { processTransaction, processImportWithRules } from '../engine'
import { validateExpectations } from '../validation'

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

  it('should warn when amount is NaN and skip min/max checks', () => {
    const transaction = createMockTransaction({
      postings: [
        createMockPosting({ amount: 'not-a-number', currency: 'USD' }),
      ],
    })
    const rule = createMockRule({
      selector: createAccountSelector('Assets:Checking'),
      expectations: { minAmount: 100, maxAmount: 500 },
    })

    const warnings = validateExpectations(transaction, rule)

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('not a valid number')
    expect(warnings[0]).toContain('not-a-number')
    // Should not have warnings about min/max since we return early
    expect(warnings[0]).not.toContain('minimum')
    expect(warnings[0]).not.toContain('maximum')
  })
})

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
          applicationType: 'automatic',
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
