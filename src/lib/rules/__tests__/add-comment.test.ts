/**
 * Tests for add_comment action
 */
import { describe, it, expect } from 'vitest'
import { Value } from 'beancount'
import type { Action } from '@/lib/db/types'
import { createMockTransaction, createMockPosting } from '@/test/test-utils'

import { applyAction } from '../actions'

describe('add_comment', () => {
  it('should add comment before transaction', () => {
    const transaction = createMockTransaction()
    const action: Action = {
      type: 'add_comment',
      comment: 'This is a test comment',
      position: 'before',
    }

    applyAction(transaction, action)

    expect(transaction.internalMetadata!.comment_before).toBeDefined()
    expect(transaction.internalMetadata!.comment_before).toBe(
      'This is a test comment',
    )
  })

  it('should add comment after transaction', () => {
    const transaction = createMockTransaction()
    const action: Action = {
      type: 'add_comment',
      comment: 'This is a test comment',
      position: 'after',
    }

    applyAction(transaction, action)

    expect(transaction.internalMetadata.comment_after).toBeDefined()
    expect(transaction.internalMetadata.comment_after).toBe(
      'This is a test comment',
    )
  })

  describe('variable replacement', () => {
    it('should replace variables in comment text', () => {
      const transaction = createMockTransaction({
        narration: 'Grocery shopping',
        payee: 'Whole Foods',
      })
      const action: Action = {
        type: 'add_comment',
        comment: 'Transaction: $narration from $payee',
        position: 'before',
      }

      applyAction(transaction, action)

      expect(transaction.internalMetadata.comment_before).toBe(
        'Transaction: Grocery shopping from Whole Foods',
      )
    })

    it('should replace metadata variables in comment', () => {
      const transaction = createMockTransaction({
        metadata: {
          category: new Value({ type: 'string', value: 'Food' }),
          notes: new Value({ type: 'string', value: 'Weekly groceries' }),
        },
      })
      const action: Action = {
        type: 'add_comment',
        comment: 'Category: $metadata_category - $metadata_notes',
        position: 'after',
      }

      applyAction(transaction, action)

      expect(transaction.internalMetadata.comment_after).toBe(
        'Category: Food - Weekly groceries',
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

      applyAction(transaction, action)

      expect(transaction.internalMetadata.comment_before).toBe(
        'From Assets:Checking: 100.00 USD',
      )
    })

    it('should handle position parameter with variables', () => {
      const transaction = createMockTransaction({
        narration: 'Test transaction',
      })
      const action: Action = {
        type: 'add_comment',
        comment: 'Note: $narration',
        position: 'before',
      }

      applyAction(transaction, action)

      expect(transaction.internalMetadata.comment_before).toBe(
        'Note: Test transaction',
      )
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
