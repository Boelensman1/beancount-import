/**
 * Tests for modify_payee action
 */
import { describe, it, expect } from 'vitest'
import { Value, type Transaction } from 'beancount'
import type { Action } from '@/lib/db/types'
import { createMockTransaction, createMockPosting } from '@/test/test-utils'

import { applyAction } from '../actions'

describe('modify_payee', () => {
  it('should replace payee', () => {
    const transaction = createMockTransaction({ payee: 'Old Payee' })
    const action: Action = {
      type: 'modify_payee',
      operation: 'replace',
      value: 'New Payee',
    }

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].payee).toBe('New Payee')
  })

  it('should set payee if empty', () => {
    const transaction = createMockTransaction({ payee: undefined })
    const action: Action = {
      type: 'modify_payee',
      operation: 'set_if_empty',
      value: 'Default Payee',
    }

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].payee).toBe('Default Payee')
  })

  it('should not set payee if not empty with set_if_empty', () => {
    const transaction = createMockTransaction({ payee: 'Existing Payee' })
    const action: Action = {
      type: 'modify_payee',
      operation: 'set_if_empty',
      value: 'Default Payee',
    }

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].payee).toBe('Existing Payee')
  })

  it('should handle empty string payee with set_if_empty', () => {
    const transaction = createMockTransaction({ payee: '' })
    const action: Action = {
      type: 'modify_payee',
      operation: 'set_if_empty',
      value: 'Default Payee',
    }

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].payee).toBe('Default Payee')
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

      const result = applyAction(transaction, action) as [Transaction]

      expect(result).toHaveLength(1)
      expect(result[0].payee).toBe('Starbucks Inc.')
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

      const result = applyAction(transaction, action) as [Transaction]

      expect(result).toHaveLength(1)
      expect(result[0].payee).toBe('Coffee at Starbucks')
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

      const result = applyAction(transaction, action) as [Transaction]

      expect(result).toHaveLength(1)
      expect(result[0].payee).toBe('Payment from Assets:Checking')
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
