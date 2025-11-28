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

  describe('array indexing', () => {
    it('should replace simple array-indexed variable', () => {
      const result = replaceVariables('Amount: $postingAmount[0]', {
        'postingAmount[0]': '100.00',
      })
      expect(result).toBe('Amount: 100.00')
    })

    it('should replace multiple array-indexed variables with different indices', () => {
      const result = replaceVariables(
        'Transfer $postingAmount[0] from $postingAccount[0] to $postingAccount[1]',
        {
          'postingAmount[0]': '100.00',
          'postingAccount[0]': 'Assets:Checking',
          'postingAccount[1]': 'Expenses:Food',
        },
      )
      expect(result).toBe(
        'Transfer 100.00 from Assets:Checking to Expenses:Food',
      )
    })

    it('should replace same array index multiple times', () => {
      const result = replaceVariables(
        'From $postingAccount[0] to $postingAccount[0]',
        {
          'postingAccount[0]': 'Assets:Checking',
        },
      )
      expect(result).toBe('From Assets:Checking to Assets:Checking')
    })

    it('should mix regular and array-indexed variables', () => {
      const result = replaceVariables(
        'Transfer $narration: $postingAmount[0] from $postingAccount[0]',
        {
          narration: 'Rent Payment',
          'postingAmount[0]': '1000.00',
          'postingAccount[0]': 'Assets:Checking',
        },
      )
      expect(result).toBe('Transfer Rent Payment: 1000.00 from Assets:Checking')
    })

    it('should handle array indices up to reasonable limits', () => {
      // Test single digit
      const result1 = replaceVariables('$postingAmount[9]', {
        'postingAmount[9]': '900.00',
      })
      expect(result1).toBe('900.00')

      // Test double digit
      const result2 = replaceVariables('$postingAmount[10]', {
        'postingAmount[10]': '1000.00',
      })
      expect(result2).toBe('1000.00')
    })

    it('should throw error for undefined array-indexed variable', () => {
      expect(() => {
        replaceVariables('Amount: $postingAmount[5]', {
          'postingAmount[0]': '100.00',
        })
      }).toThrow("Variable '$postingAmount[5]' is not defined")
    })

    it('should handle array-indexed variables at word boundaries', () => {
      const result = replaceVariables(
        '$postingAmount[0] and $postingAmount[0]x',
        {
          'postingAmount[0]': '100.00',
          'postingAmount[0]x': 'extra',
        },
      )
      expect(result).toBe('100.00 and extra')
    })

    it('should handle array-indexed variables with special chars in values', () => {
      const result = replaceVariables('Account: $postingAccount[0]', {
        'postingAccount[0]': 'Assets:Bank&Trust:Savings',
      })
      expect(result).toBe('Account: Assets:Bank&Trust:Savings')
    })

    it('should handle empty string value for array-indexed variable', () => {
      const result = replaceVariables('Amount: $postingAmount[0]', {
        'postingAmount[0]': '',
      })
      expect(result).toBe('Amount: ')
    })

    it('should handle large index numbers', () => {
      const result = replaceVariables('$postingAmount[999]', {
        'postingAmount[999]': '999.00',
      })
      expect(result).toBe('999.00')
    })

    it('should not match invalid array syntax', () => {
      // These should not be recognized as variables (no $ prefix after replacement)
      const result = replaceVariables('$valid[0] but postingAmount[] is not', {
        'valid[0]': 'value',
      })
      expect(result).toBe('value but postingAmount[] is not')
    })

    it('should handle array-indexed variables in complex strings', () => {
      const result = replaceVariables(
        'Multi-line:\n$postingAmount[0]\n$postingAccount[0]',
        {
          'postingAmount[0]': '100.00',
          'postingAccount[0]': 'Assets:Checking',
        },
      )
      expect(result).toBe('Multi-line:\n100.00\nAssets:Checking')
    })
  })
})
