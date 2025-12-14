/**
 * Tests for add_comment action
 */
import { describe, it, expect } from 'vitest'
import type { Action } from '@/lib/db/types'
import { createMockTransaction, createMockPosting } from '@/test/test-utils'

import { applyAction } from '../actions'

describe('add_comment', () => {
  it('should add comment before transaction', () => {
    const transaction = createMockTransaction()
    const comment = '; This is a test comment'
    const action: Action = {
      type: 'add_comment',
      comment,
      position: 'before',
    }

    const result = applyAction(transaction, action)

    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('comment')
    expect(result[1].type).toBe('transaction')
    expect(result[0].toString()).toBe(comment)
  })

  it('should add comment after transaction', () => {
    const transaction = createMockTransaction()
    const comment = '; This is a test comment'
    const action: Action = {
      type: 'add_comment',
      comment,
      position: 'after',
    }

    const result = applyAction(transaction, action)

    expect(result).toHaveLength(2)
    expect(result[1].type).toBe('comment')
    expect(result[0].type).toBe('transaction')
    expect(result[1].toString()).toBe(comment)
  })

  describe('variable replacement', () => {
    it('should replace variables in comment text', () => {
      const transaction = createMockTransaction({
        narration: 'Grocery shopping',
        payee: 'Whole Foods',
      })
      const action: Action = {
        type: 'add_comment',
        comment: '; Transaction: $narration from $payee',
        position: 'before',
      }

      const result = applyAction(transaction, action)

      expect(result).toHaveLength(2)
      expect(result[0].type).toBe('comment')
      expect(result[1].type).toBe('transaction')
      expect(result[0].toString()).toBe(
        '; Transaction: Grocery shopping from Whole Foods',
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

      const result = applyAction(transaction, action)

      expect(result).toHaveLength(2)
      expect(result[0].type).toBe('comment')
      expect(result[1].type).toBe('transaction')
      expect(result[0].toString()).toBe('From Assets:Checking: 100.00 USD')
    })

    it('should handle position parameter with variables', () => {
      const transaction = createMockTransaction({
        narration: 'Test transaction',
      })
      const action: Action = {
        type: 'add_comment',
        comment: '; Note: $narration',
        position: 'before',
      }

      const result = applyAction(transaction, action)

      expect(result).toHaveLength(2)
      expect(result[0].type).toBe('comment')
      expect(result[1].type).toBe('transaction')
      expect(result[0].toString()).toBe('; Note: Test transaction')
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
