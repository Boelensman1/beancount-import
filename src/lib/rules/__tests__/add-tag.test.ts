/**
 * Tests for add_tag action
 */
import { describe, it, expect } from 'vitest'
import { Value } from 'beancount'
import type { Action } from '@/lib/db/types'
import {
  createMockTransaction,
  createMockPosting,
  createTag,
} from '@/test/test-utils'

import { applyAction } from '../actions'

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
