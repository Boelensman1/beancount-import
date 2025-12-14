/**
 * Tests for add_link action
 */
import { Temporal } from '@js-temporal/polyfill'
import { describe, it, expect } from 'vitest'
import { type Transaction, Value } from 'beancount'
import type { Action } from '@/lib/db/types'
import { createMockTransaction, createMockPosting } from '@/test/test-utils'

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

      const result = applyAction(transaction, action) as [Transaction]

      expect(result).toHaveLength(1)
      expect(result[0].links.has('^INV-12345')).toBe(true)
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

      const result = applyAction(transaction, action) as [Transaction]

      expect(result).toHaveLength(1)
      expect(result[0].links.has('^2024-01-15-Acme Corp')).toBe(true)
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

      const result = applyAction(transaction, action) as [Transaction]

      expect(result).toHaveLength(1)
      expect(result[0].links.has('^receipt-100.00')).toBe(true)
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
