import { describe, it, expect } from 'vitest'
import { replaceVariables } from './replaceVariables'

describe('replaceVariables', () => {
  describe('basic replacement', () => {
    it('should replace single variable', () => {
      const result = replaceVariables('import $account', {
        account: 'Income:Rent',
      })
      expect(result).toBe('import Income:Rent')
    })

    it('should replace multiple different variables', () => {
      const result = replaceVariables('import $account from $file', {
        account: 'Income:Rent',
        file: '/path/to/file.csv',
      })
      expect(result).toBe('import Income:Rent from /path/to/file.csv')
    })

    it('should replace multiple occurrences of same variable', () => {
      const result = replaceVariables('$account and $account', {
        account: 'Test',
      })
      expect(result).toBe('Test and Test')
    })

    it('should handle empty string', () => {
      const result = replaceVariables('', {})
      expect(result).toBe('')
    })

    it('should handle string with no variables', () => {
      const result = replaceVariables('plain text', { account: 'Test' })
      expect(result).toBe('plain text')
    })
  })

  describe('error handling', () => {
    it('should throw error for undefined variable', () => {
      expect(() => {
        replaceVariables('import $account $missing', { account: 'Test' })
      }).toThrow("Variable '$missing' is not defined")
    })

    it('should throw error when no variables provided but string has variables', () => {
      expect(() => {
        replaceVariables('import $account', {})
      }).toThrow("Variable '$account' is not defined")
    })
  })

  describe('word boundaries', () => {
    it('should not replace partial matches', () => {
      const result = replaceVariables('$account and $accountId', {
        account: 'Test',
        accountId: 'TestId',
      })
      expect(result).toBe('Test and TestId')
    })

    it('should replace variable at start of string', () => {
      const result = replaceVariables('$account', { account: 'Test' })
      expect(result).toBe('Test')
    })

    it('should replace variable at end of string', () => {
      const result = replaceVariables('import $account', { account: 'Test' })
      expect(result).toBe('import Test')
    })
  })

  describe('special characters', () => {
    it('should handle values with special characters', () => {
      const result = replaceVariables('import $account', {
        account: 'Assets:Bank&Trust',
      })
      expect(result).toBe('import Assets:Bank&Trust')
    })

    it('should preserve dollar signs not part of variables', () => {
      const result = replaceVariables('Cost: $50 for $account', {
        account: 'Test',
      })
      expect(result).toBe('Cost: $50 for Test')
    })

    it('should handle colons in values (beancount accounts)', () => {
      const result = replaceVariables('$account', {
        account: 'Income:Rent:Apartment',
      })
      expect(result).toBe('Income:Rent:Apartment')
    })
  })
})
