/**
 * Tests for set_flag action
 */
import { describe, it, expect } from 'vitest'
import { type Transaction } from 'beancount'
import type { Action } from '@/lib/db/types'

import { createMockTransaction } from '@/test/test-utils'

import { applyAction } from '../actions'

describe('set_flag', () => {
  it('should set transaction flag', () => {
    const transaction = createMockTransaction({ flag: '*' })
    const action: Action = {
      type: 'set_flag',
      flag: '!',
    }

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].flag).toBe('!')
  })

  it('should set custom flag', () => {
    const transaction = createMockTransaction({ flag: '*' })
    const action: Action = {
      type: 'set_flag',
      flag: 'P',
    }

    const result = applyAction(transaction, action) as [Transaction]

    expect(result).toHaveLength(1)
    expect(result[0].flag).toBe('P')
  })
})
