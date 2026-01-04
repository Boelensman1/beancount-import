/**
 * Tests for add_link action
 */
import { Temporal } from '@js-temporal/polyfill'
import { describe, it, expect } from 'vitest'
import { type Transaction } from 'beancount'
import type { Action } from '@/lib/db/types'
import {
  createMockTransaction,
  describeVariableReplacement,
} from '@/test/test-utils'

import { applyAction } from '../actions'

describe('add_link', () => {
  it('should add link to transaction', () => {
    const transaction = createMockTransaction({ links: new Set() })
    const action: Action = {
      type: 'add_link',
      link: '^invoice-123',
    }

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].links.has('^invoice-123')).toBe(true)
  })

  it('should not add duplicate link', () => {
    const transaction = createMockTransaction({
      links: new Set(['^invoice-123']),
    })
    const action: Action = {
      type: 'add_link',
      link: '^invoice-123',
    }

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].links.size).toBe(1)
  })

  it('should add multiple different links', () => {
    const transaction = createMockTransaction({ links: new Set() })
    const action1: Action = { type: 'add_link', link: '^invoice-123' }
    const action2: Action = { type: 'add_link', link: '^receipt-456' }

    const result1 = applyAction(transaction, action1) as [Transaction]

    expect(result1).toHaveLength(1)
    const result2 = applyAction(result1[0], action2) as [Transaction]

    expect(result2).toHaveLength(1)
    expect(result2[0].links.size).toBe(2)
    expect(result2[0].links.has('^invoice-123')).toBe(true)
    expect(result2[0].links.has('^receipt-456')).toBe(true)
  })

  // Use shared helper for standard variable replacement tests
  describeVariableReplacement(
    applyAction,
    (value) => ({ type: 'add_link', link: value }) as Action,
    (result) => [...(result as Transaction[])[0].links][0],
  )

  // Additional custom variable test for multiple variables
  it('should create dynamic links from multiple variables', () => {
    const transaction = createMockTransaction({
      links: new Set(),
      date: Temporal.PlainDate.from('2024-01-15'),
      payee: 'Acme Corp',
    })
    const action: Action = {
      type: 'add_link',
      link: '^$date-$payee',
    }

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].links.has('^2024-01-15-Acme Corp')).toBe(true)
  })
})
