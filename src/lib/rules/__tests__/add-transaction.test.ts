/**
 * Tests for add_transaction action
 */
import { describe, it, expect } from 'vitest'
import { Transaction } from 'beancount'
import type { Action } from '@/lib/db/types'
import {
  createMockTransaction,
  createMockPosting,
  describeVariableReplacement,
} from '@/test/test-utils'

import { applyAction } from '../actions'

/**
 * Build an add_transaction action with sensible defaults for these tests
 */
function createAddTransactionAction(
  overrides: Partial<Extract<Action, { type: 'add_transaction' }>> = {},
): Action {
  return {
    type: 'add_transaction',
    position: 'after',
    postings: [],
    ...overrides,
  }
}

describe('add_transaction', () => {
  it('should add the new transaction after the original', () => {
    const transaction = createMockTransaction({ narration: 'Original' })
    const action = createAddTransactionAction({
      position: 'after',
      narration: 'Generated',
    })

    const result = applyAction(transaction, action)

    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('transaction')
    expect(result[1].type).toBe('transaction')
    expect((result[0] as Transaction).narration).toBe('Original')
    expect((result[1] as Transaction).narration).toBe('Generated')
  })

  it('should add the new transaction before the original', () => {
    const transaction = createMockTransaction({ narration: 'Original' })
    const action = createAddTransactionAction({
      position: 'before',
      narration: 'Generated',
    })

    const result = applyAction(transaction, action)

    expect(result).toHaveLength(2)
    expect((result[0] as Transaction).narration).toBe('Generated')
    expect((result[1] as Transaction).narration).toBe('Original')
  })

  it('should not modify the original transaction', () => {
    const transaction = createMockTransaction({ narration: 'Original' })
    const action = createAddTransactionAction({ narration: 'Generated' })

    applyAction(transaction, action)

    expect(transaction.narration).toBe('Original')
  })

  it('should set payee, narration and flag', () => {
    const transaction = createMockTransaction()
    const action = createAddTransactionAction({
      flag: '!',
      payee: 'Tax office',
      narration: 'VAT',
    })

    const newTransaction = applyAction(transaction, action)[1] as Transaction

    expect(newTransaction.flag).toBe('!')
    expect(newTransaction.payee).toBe('Tax office')
    expect(newTransaction.narration).toBe('VAT')
  })

  it('should default the flag to * when empty', () => {
    const transaction = createMockTransaction()

    const newTransaction = applyAction(
      transaction,
      createAddTransactionAction({ flag: '' }),
    )[1] as Transaction

    expect(newTransaction.flag).toBe('*')
  })

  it('should default the date to the source transaction date', () => {
    const transaction = createMockTransaction({ date: '2024-03-07' })

    const newTransaction = applyAction(
      transaction,
      createAddTransactionAction({ date: '' }),
    )[1] as Transaction

    expect(newTransaction.date.toString()).toBe('2024-03-07')
  })

  it('should use an explicit date when provided', () => {
    const transaction = createMockTransaction({ date: '2024-03-07' })

    const newTransaction = applyAction(
      transaction,
      createAddTransactionAction({ date: '2024-12-31' }),
    )[1] as Transaction

    expect(newTransaction.date.toString()).toBe('2024-12-31')
  })

  it('should throw a readable error when the date is not a valid date', () => {
    const transaction = createMockTransaction()
    const action = createAddTransactionAction({ date: 'tomorrow' })

    expect(() => applyAction(transaction, action)).toThrow(
      'add_transaction: "tomorrow" resolved to "tomorrow", which is not a YYYY-MM-DD date',
    )
  })

  it('should add postings with amount and currency', () => {
    const transaction = createMockTransaction()
    const action = createAddTransactionAction({
      postings: [
        {
          account: 'Expenses:VAT',
          amount: { value: '21.00', currency: 'EUR' },
        },
        {
          account: 'Liabilities:VATDue',
          amount: { value: '-21.00', currency: 'EUR' },
        },
      ],
    })

    const newTransaction = applyAction(transaction, action)[1] as Transaction

    expect(newTransaction.postings).toHaveLength(2)
    expect(newTransaction.postings[0].account).toBe('Expenses:VAT')
    expect(newTransaction.postings[0].amount).toBe('21.00')
    expect(newTransaction.postings[0].currency).toBe('EUR')
    expect(newTransaction.postings[1].account).toBe('Liabilities:VATDue')
    expect(newTransaction.postings[1].amount).toBe('-21.00')
  })

  it('should omit the amount for an auto posting', () => {
    const transaction = createMockTransaction()
    const action = createAddTransactionAction({
      postings: [
        { account: 'Expenses:VAT', amount: { value: 'auto', currency: 'EUR' } },
      ],
    })

    const newTransaction = applyAction(transaction, action)[1] as Transaction

    expect(newTransaction.postings[0].amount).toBeUndefined()
  })

  it('should replace variables in posting accounts and amounts', () => {
    const transaction = createMockTransaction({
      postings: [
        createMockPosting({
          account: 'Assets:Checking',
          amount: '-42.50',
          currency: 'EUR',
        }),
      ],
    })
    const action = createAddTransactionAction({
      postings: [
        {
          account: 'Mirror:$postingAccount[0]',
          amount: {
            value: '$absolutePostingAmount[0]',
            currency: '$postingCurrency[0]',
          },
        },
      ],
    })

    const newTransaction = applyAction(transaction, action)[1] as Transaction

    expect(newTransaction.postings[0].account).toBe('Mirror:Assets:Checking')
    expect(newTransaction.postings[0].amount).toBe('42.50')
    expect(newTransaction.postings[0].currency).toBe('EUR')
  })

  it('should add tags and links', () => {
    const transaction = createMockTransaction({ narration: 'Coffee' })
    const action = createAddTransactionAction({
      tags: ['vat', 'from-$narration'],
      links: ['invoice-123'],
    })

    const newTransaction = applyAction(transaction, action)[1] as Transaction

    expect(newTransaction.tags.map((tag) => tag.content)).toEqual([
      'vat',
      'from-Coffee',
    ])
    expect([...newTransaction.links]).toEqual(['invoice-123'])
  })

  it('should add metadata preserving string, number and boolean types', () => {
    const transaction = createMockTransaction()
    const action = createAddTransactionAction({
      metadata: {
        source: 'rule',
        count: 3,
        verified: true,
      },
    })

    const newTransaction = applyAction(transaction, action)[1] as Transaction

    expect(newTransaction.metadata!.source.type).toBe('string')
    expect(newTransaction.metadata!.source.value).toBe('rule')
    expect(newTransaction.metadata!.count.type).toBe('numbers')
    expect(newTransaction.metadata!.count.value).toBe('3')
    expect(newTransaction.metadata!.verified.type).toBe('boolean')
    expect(newTransaction.metadata!.verified.value).toBe(true)
  })

  it('should replace variables in metadata values', () => {
    const transaction = createMockTransaction({ payee: 'Starbucks' })
    const action = createAddTransactionAction({
      metadata: { origin: '$payee' },
    })

    const newTransaction = applyAction(transaction, action)[1] as Transaction

    expect(newTransaction.metadata!.origin.value).toBe('Starbucks')
  })

  it('should inherit the output file from the source transaction', () => {
    const transaction = createMockTransaction()
    transaction.internalMetadata.outputFile = 'ledger/2024.beancount'

    const newTransaction = applyAction(
      transaction,
      createAddTransactionAction(),
    )[1] as Transaction

    expect(newTransaction.internalMetadata.outputFile).toBe(
      'ledger/2024.beancount',
    )
  })

  it('should leave the output file unset when the source has none', () => {
    const transaction = createMockTransaction()

    const newTransaction = applyAction(
      transaction,
      createAddTransactionAction(),
    )[1] as Transaction

    expect(newTransaction.internalMetadata.outputFile).toBeUndefined()
  })

  // Use shared helper for standard variable replacement tests
  // Note: the generated transaction is at index 1 for position 'after'
  describeVariableReplacement(
    applyAction,
    (value) => createAddTransactionAction({ narration: value }),
    (result) => (result[1] as Transaction).narration ?? '',
  )
})
