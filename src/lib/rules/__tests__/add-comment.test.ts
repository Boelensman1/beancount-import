/**
 * Tests for add_comment action
 */
import { describe, it, expect } from 'vitest'
import type { Action } from '@/lib/db/types'
import {
  createMockTransaction,
  describeVariableReplacement,
} from '@/test/test-utils'

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

  // Use shared helper for standard variable replacement tests
  // Note: add_comment returns [comment, transaction], so we extract from index 0
  describeVariableReplacement(
    applyAction,
    (value) =>
      ({ type: 'add_comment', comment: value, position: 'before' }) as Action,
    (result) => result[0].toString(),
  )

  // Additional test for 'after' position
  it('should replace variables in comment at after position', () => {
    const transaction = createMockTransaction({
      narration: 'Test transaction',
    })
    const action: Action = {
      type: 'add_comment',
      comment: '; Note: $narration',
      position: 'after',
    }

    const result = applyAction(transaction, action)

    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('transaction')
    expect(result[1].type).toBe('comment')
    expect(result[1].toString()).toBe('; Note: Test transaction')
  })
})
