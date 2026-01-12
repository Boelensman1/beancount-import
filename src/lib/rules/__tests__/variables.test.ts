/**
 * Tests for variable extraction from transactions
 */
import { describe, it, expect } from 'vitest'
import { Value } from 'beancount'
import { createMockTransaction, createMockPosting } from '@/test/test-utils'

import { buildVariablesFromTransaction } from '../transaction-variables'

describe('buildVariablesFromTransaction', () => {
  describe('basic transaction fields', () => {
    it('should extract narration', () => {
      const transaction = createMockTransaction({
        narration: 'Grocery shopping',
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.narration).toBe('Grocery shopping')
    })

    it('should extract payee', () => {
      const transaction = createMockTransaction({
        payee: 'Whole Foods',
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.payee).toBe('Whole Foods')
    })

    it('should extract date as string', () => {
      const transaction = createMockTransaction({
        date: '2024-01-15',
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.date).toBe('2024-01-15')
    })

    it('should extract flag', () => {
      const transaction = createMockTransaction({
        flag: '*',
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.flag).toBe('*')
    })

    it('should handle empty narration', () => {
      const transaction = createMockTransaction({
        narration: '',
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.narration).toBe('')
    })

    it('should handle missing payee', () => {
      const transaction = createMockTransaction({
        payee: undefined,
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.payee).toBe('')
    })
  })

  describe('posting data arrays', () => {
    it('should extract posting amounts with indices', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ amount: '100.00' }),
          createMockPosting({ amount: '-100.00' }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['postingAmount[0]']).toBe('100.00')
      expect(variables['postingAmount[1]']).toBe('-100.00')
    })

    it('should extract posting accounts with indices', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ account: 'Assets:Checking' }),
          createMockPosting({ account: 'Expenses:Food' }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['postingAccount[0]']).toBe('Assets:Checking')
      expect(variables['postingAccount[1]']).toBe('Expenses:Food')
    })

    it('should extract posting currencies with indices', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ currency: 'USD' }),
          createMockPosting({ currency: 'EUR' }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['postingCurrency[0]']).toBe('USD')
      expect(variables['postingCurrency[1]']).toBe('EUR')
    })

    it('should extract absolute posting amounts with indices', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ amount: '100.00' }),
          createMockPosting({ amount: '-50.50' }),
          createMockPosting({ amount: '0' }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['absolutePostingAmount[0]']).toBe('100.00')
      expect(variables['absolutePostingAmount[1]']).toBe('50.50')
      expect(variables['absolutePostingAmount[2]']).toBe('0')
    })

    it('should handle empty amount for absolute posting amount', () => {
      const transaction = createMockTransaction({
        postings: [createMockPosting({ amount: '' })],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['absolutePostingAmount[0]']).toBe('')
    })

    it('should handle invalid amount for absolute posting amount', () => {
      const transaction = createMockTransaction({
        postings: [createMockPosting({ amount: 'invalid' })],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['absolutePostingAmount[0]']).toBe('')
    })

    it('should preserve various decimal place counts in absolute posting amounts', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ amount: '100.00' }),
          createMockPosting({ amount: '-50.5' }),
          createMockPosting({ amount: '75' }),
          createMockPosting({ amount: '12.345' }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['absolutePostingAmount[0]']).toBe('100.00')
      expect(variables['absolutePostingAmount[1]']).toBe('50.5')
      expect(variables['absolutePostingAmount[2]']).toBe('75')
      expect(variables['absolutePostingAmount[3]']).toBe('12.345')
    })

    it('should handle trailing zeros in absolute posting amounts', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ amount: '-200.00' }),
          createMockPosting({ amount: '0.50' }),
          createMockPosting({ amount: '100.0' }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['absolutePostingAmount[0]']).toBe('200.00')
      expect(variables['absolutePostingAmount[1]']).toBe('0.50')
      expect(variables['absolutePostingAmount[2]']).toBe('100.0')
    })

    it('should handle zero with decimals in absolute posting amounts', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ amount: '0.00' }),
          createMockPosting({ amount: '-0.0' }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['absolutePostingAmount[0]']).toBe('0.00')
      expect(variables['absolutePostingAmount[1]']).toBe('0.0')
    })

    it('should handle amounts with whitespace', () => {
      const transaction = createMockTransaction({
        postings: [createMockPosting({ amount: ' 100.00 ' })],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['absolutePostingAmount[0]']).toBe('100.00')
    })

    it('should extract negated posting amounts with indices', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ amount: '100.00' }),
          createMockPosting({ amount: '-50.50' }),
          createMockPosting({ amount: '0' }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['negatedPostingAmount[0]']).toBe('-100.00')
      expect(variables['negatedPostingAmount[1]']).toBe('50.50')
      expect(variables['negatedPostingAmount[2]']).toBe('0')
    })

    it('should preserve decimal places for negated amounts', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ amount: '10.5' }),
          createMockPosting({ amount: '-5.00' }),
          createMockPosting({ amount: '100' }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['negatedPostingAmount[0]']).toBe('-10.5')
      expect(variables['negatedPostingAmount[1]']).toBe('5.00')
      expect(variables['negatedPostingAmount[2]']).toBe('-100')
    })

    it('should handle empty amount for negated posting amount', () => {
      const transaction = createMockTransaction({
        postings: [createMockPosting({ amount: '' })],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['negatedPostingAmount[0]']).toBe('')
    })

    it('should handle invalid amount for negated posting amount', () => {
      const transaction = createMockTransaction({
        postings: [createMockPosting({ amount: 'invalid' })],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['negatedPostingAmount[0]']).toBe('')
    })

    it('should preserve various decimal place counts in negated posting amounts', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ amount: '100.00' }),
          createMockPosting({ amount: '-50.5' }),
          createMockPosting({ amount: '75' }),
          createMockPosting({ amount: '-12.345' }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['negatedPostingAmount[0]']).toBe('-100.00')
      expect(variables['negatedPostingAmount[1]']).toBe('50.5')
      expect(variables['negatedPostingAmount[2]']).toBe('-75')
      expect(variables['negatedPostingAmount[3]']).toBe('12.345')
    })

    it('should handle trailing zeros in negated posting amounts', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ amount: '-200.00' }),
          createMockPosting({ amount: '0.50' }),
          createMockPosting({ amount: '-100.0' }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['negatedPostingAmount[0]']).toBe('200.00')
      expect(variables['negatedPostingAmount[1]']).toBe('-0.50')
      expect(variables['negatedPostingAmount[2]']).toBe('100.0')
    })

    it('should handle zero with decimals in negated posting amounts', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ amount: '0.00' }),
          createMockPosting({ amount: '-0.0' }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['negatedPostingAmount[0]']).toBe('0.00')
      expect(variables['negatedPostingAmount[1]']).toBe('0.0')
    })

    it('should handle amounts with whitespace for negated posting amounts', () => {
      const transaction = createMockTransaction({
        postings: [createMockPosting({ amount: ' -100.00 ' })],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['negatedPostingAmount[0]']).toBe('100.00')
    })

    it('should handle transaction with single posting', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({
            account: 'Assets:Checking',
            amount: '50.00',
          }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['postingAccount[0]']).toBe('Assets:Checking')
      expect(variables['postingAmount[0]']).toBe('50.00')
    })

    it('should handle transaction with many postings', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ amount: '10.00' }),
          createMockPosting({ amount: '20.00' }),
          createMockPosting({ amount: '30.00' }),
          createMockPosting({ amount: '-60.00' }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['postingAmount[0]']).toBe('10.00')
      expect(variables['postingAmount[1]']).toBe('20.00')
      expect(variables['postingAmount[2]']).toBe('30.00')
      expect(variables['postingAmount[3]']).toBe('-60.00')
    })

    it('should handle posting with empty amount', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({ amount: '', account: 'Assets:Checking' }),
        ],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['postingAmount[0]']).toBe('')
    })

    it('should handle posting with empty account', () => {
      const transaction = createMockTransaction({
        postings: [createMockPosting({ account: '', amount: '100.00' })],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['postingAccount[0]']).toBe('')
    })

    it('should handle transaction with no postings', () => {
      const transaction = createMockTransaction({
        postings: [],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.narration).toBe('Test Narration')
      expect(variables['postingAmount[0]']).toBeUndefined()
    })
  })

  describe('metadata extraction', () => {
    it('should extract string metadata with prefix', () => {
      const transaction = createMockTransaction({
        metadata: {
          category: new Value({ type: 'string', value: 'groceries' }),
        },
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.metadata_category).toBe('groceries')
    })

    it('should extract number metadata as string', () => {
      const transaction = createMockTransaction({
        metadata: {
          quantity: new Value({ type: 'numbers', value: 42 }),
        },
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.metadata_quantity).toBe('42')
    })

    it('should extract boolean metadata as string', () => {
      const transaction = createMockTransaction({
        metadata: {
          reviewed: new Value({ type: 'boolean', value: true }),
        },
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.metadata_reviewed).toBe('true')
    })

    it('should handle multiple metadata nodes', () => {
      const transaction = createMockTransaction({
        metadata: {
          category: new Value({ type: 'string', value: 'groceries' }),
          store: new Value({ type: 'string', value: 'Whole Foods' }),
          invoiceNumber: new Value({ type: 'string', value: 'INV-123' }),
        },
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.metadata_category).toBe('groceries')
      expect(variables.metadata_store).toBe('Whole Foods')
      expect(variables.metadata_invoiceNumber).toBe('INV-123')
    })

    it('should handle metadata with special characters in key', () => {
      const transaction = createMockTransaction({
        metadata: {
          'custom-field-name': new Value({
            type: 'string',
            value: 'test-value',
          }),
        },
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables['metadata_custom-field-name']).toBe('test-value')
    })

    it('should handle transaction with no metadata', () => {
      const transaction = createMockTransaction({
        metadata: {},
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.narration).toBe('Test Narration')
      expect(variables.metadata_anything).toBeUndefined()
    })

    it('should handle empty string metadata value', () => {
      const transaction = createMockTransaction({
        metadata: {
          note: new Value({ type: 'string', value: '' }),
        },
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.metadata_note).toBe('')
    })
  })

  describe('comprehensive extraction', () => {
    it('should extract all variable types in single transaction', () => {
      const transaction = createMockTransaction({
        narration: 'Original Narration',
        payee: 'Test Payee',
        date: '2024-01-15',
        flag: '*',
        postings: [
          createMockPosting({
            account: 'Assets:Checking',
            amount: '100.00',
            currency: 'USD',
          }),
          createMockPosting({
            account: 'Expenses:Food',
            amount: '-100.00',
            currency: 'USD',
          }),
        ],
        metadata: {
          category: new Value({ type: 'string', value: 'groceries' }),
        },
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.narration).toBe('Original Narration')
      expect(variables.payee).toBe('Test Payee')
      expect(variables.date).toBe('2024-01-15')
      expect(variables.flag).toBe('*')
      expect(variables['postingAmount[0]']).toBe('100.00')
      expect(variables['postingAccount[0]']).toBe('Assets:Checking')
      expect(variables['postingCurrency[0]']).toBe('USD')
      expect(variables['postingAmount[1]']).toBe('-100.00')
      expect(variables['postingAccount[1]']).toBe('Expenses:Food')
      expect(variables['postingCurrency[1]']).toBe('USD')
      expect(variables.metadata_category).toBe('groceries')
    })

    it('should handle transaction with minimal data', () => {
      const transaction = createMockTransaction({
        narration: 'Test',
        postings: [],
      })

      const variables = buildVariablesFromTransaction(transaction)

      expect(variables.narration).toBe('Test')
      expect(variables.payee).toBe('Test Payee') // Default from createMockTransaction
      expect(variables.date).toBeTruthy()
      expect(variables.flag).toBeTruthy()
    })
  })
})
