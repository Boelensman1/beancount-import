/**
 * Tests for add_link action
 */
import { Temporal } from '@js-temporal/polyfill'
import { describe, it, expect } from 'vitest'
import { Value } from 'beancount'
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
