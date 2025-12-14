/**
 * Tests for set_flag action
 */
import { describe, it, expect } from 'vitest'
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

    applyAction(transaction, action)

    expect(transaction.flag).toBe('!')
  })

  it('should change flag from cleared to pending', () => {
    const transaction = createMockTransaction({ flag: '*' })
    const action: Action = {
      type: 'set_flag',
      flag: '!',
    }

    applyAction(transaction, action)

    expect(transaction.flag).toBe('!')
  })

  it('should set custom flag', () => {
    const transaction = createMockTransaction({ flag: '*' })
    const action: Action = {
      type: 'set_flag',
      flag: 'P',
    }

    applyAction(transaction, action)

    expect(transaction.flag).toBe('P')
  })
})
