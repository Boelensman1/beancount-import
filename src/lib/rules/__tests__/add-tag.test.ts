/**
 * Tests for add_tag action
 */
import { describe, it, expect } from 'vitest'
import { type Transaction } from 'beancount'
import type { Action } from '@/lib/db/types'
import {
  createMockTransaction,
  createTag,
  describeVariableReplacement,
} from '@/test/test-utils'

import { applyAction } from '../actions'

describe('add_tag', () => {
  it('should add tag to transaction', () => {
    const transaction = createMockTransaction({ tags: [] })
    const action: Action = {
      type: 'add_tag',
      tag: 'vacation',
    }

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].tags).toHaveLength(1)
    expect(result[0].tags[0].content).toBe('vacation')
    expect(result[0].tags[0].fromStack).toBe(false)
  })

  it('should not add duplicate tag', () => {
    const transaction = createMockTransaction({
      tags: [createTag('vacation')],
    })
    const action: Action = {
      type: 'add_tag',
      tag: 'vacation',
    }

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].tags).toHaveLength(1)
  })

  it('should add multiple different tags', () => {
    const transaction = createMockTransaction({ tags: [] })
    const action1: Action = { type: 'add_tag', tag: 'vacation' }
    const action2: Action = { type: 'add_tag', tag: 'travel' }

    const result1 = applyAction(transaction, action1) as [Transaction]

    expect(result1).toHaveLength(1)
    const result2 = applyAction(result1[0], action2) as [Transaction]

    expect(result2).toHaveLength(1)
    expect(result2[0].tags).toHaveLength(2)
    expect(result2[0].tags[0].content).toBe('vacation')
    expect(result2[0].tags[1].content).toBe('travel')
  })

  // Use shared helper for standard variable replacement tests
  describeVariableReplacement(
    applyAction,
    (value) => ({ type: 'add_tag', tag: value }) as Action,
    (result) => (result as Transaction[])[0].tags[0].content,
  )
})
