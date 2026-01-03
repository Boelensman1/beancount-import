/**
 * Tests for comment_out_transaction action
 */
import { describe, it, expect } from 'vitest'
import type { Action } from '@/lib/db/types'
import { createMockTransaction } from '@/test/test-utils'

import { applyAction } from '../actions'

describe('comment_out_transaction', () => {
  it('should set commentOut metadata to true', () => {
    const transaction = createMockTransaction({
      narration: 'Test transaction',
      payee: 'Test Payee',
    })
    const action: Action = {
      type: 'comment_out_transaction',
    }

    const result = applyAction(transaction, action)

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('transaction')
    expect(result[0].internalMetadata.commentOut).toBe(true)
  })

  it('should return the transaction (not convert to comments)', () => {
    const transaction = createMockTransaction()
    const action: Action = {
      type: 'comment_out_transaction',
    }

    const result = applyAction(transaction, action)

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('transaction')
  })

  it('should preserve existing outputFile metadata', () => {
    const transaction = createMockTransaction()
    transaction.internalMetadata.outputFile = '/path/to/output.beancount'
    const action: Action = {
      type: 'comment_out_transaction',
    }

    const result = applyAction(transaction, action)

    expect(result[0].internalMetadata.outputFile).toBe(
      '/path/to/output.beancount',
    )
    expect(result[0].internalMetadata.commentOut).toBe(true)
  })

  it('should not modify the original transaction', () => {
    const transaction = createMockTransaction()
    const action: Action = {
      type: 'comment_out_transaction',
    }

    applyAction(transaction, action)

    // Original transaction should not have commentOut set
    expect(transaction.internalMetadata.commentOut).toBeUndefined()
  })
})
