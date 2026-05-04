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
    const action: Action = {
      type: 'add_comment',
      comment: 'This is a test comment',
      position: 'before',
    }

    const result = applyAction(transaction, action)

    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('comment')
    expect(result[1].type).toBe('transaction')
    expect(result[0].toString()).toBe('; This is a test comment')
  })

  it('should add comment after transaction', () => {
    const transaction = createMockTransaction()
    const action: Action = {
      type: 'add_comment',
      comment: 'This is a test comment',
      position: 'after',
    }

    const result = applyAction(transaction, action)

    expect(result).toHaveLength(2)
    expect(result[1].type).toBe('comment')
    expect(result[0].type).toBe('transaction')
    expect(result[1].toString()).toBe('; This is a test comment')
  })

  // Use shared helper for standard variable replacement tests
  // Note: add_comment returns [comment, transaction], so we extract from index 0
  // and strip the '; ' prefix that add_comment prepends automatically.
  describeVariableReplacement(
    applyAction,
    (value) =>
      ({ type: 'add_comment', comment: value, position: 'before' }) as Action,
    (result) => result[0].toString().replace(/^; /, ''),
  )

  // Additional test for 'after' position
  it('should replace variables in comment at after position', () => {
    const transaction = createMockTransaction({
      narration: 'Test transaction',
    })
    const action: Action = {
      type: 'add_comment',
      comment: 'Note: $narration',
      position: 'after',
    }

    const result = applyAction(transaction, action)

    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('transaction')
    expect(result[1].type).toBe('comment')
    expect(result[1].toString()).toBe('; Note: Test transaction')
  })
})
