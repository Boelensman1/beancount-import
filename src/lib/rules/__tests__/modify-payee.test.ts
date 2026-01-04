/**
 * Tests for modify_payee action
 */
import { describe, it, expect } from 'vitest'
import { type Transaction } from 'beancount'
import type { Action } from '@/lib/db/types'
import {
  createMockTransaction,
  describeVariableReplacement,
} from '@/test/test-utils'

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

  // Use shared helper for standard variable replacement tests
  describeVariableReplacement(
    applyAction,
    (value) =>
      ({ type: 'modify_payee', operation: 'replace', value }) as Action,
    (result) => (result as Transaction[])[0].payee!,
  )

  // Additional test for set_if_empty operation
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
})
