import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { mergeTransactionsIntoFile, FileMergeError } from './fileMerge'
import { createMockTransaction } from '@/test/test-utils'

describe('fileMerge', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'beancount-merge-test-'))
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('mergeTransactionsIntoFile', () => {
    it('should merge transactions into existing file', async () => {
      const filePath = path.join(testDir, 'existing.beancount')
      const existingContent = `2024-01-01 * "Existing transaction"
  Assets:Checking  100.00 USD
  Expenses:Food   -100.00 USD
`
      await fs.writeFile(filePath, existingContent)

      const newTx = createMockTransaction({
        date: '2024-01-02',
        narration: 'New transaction',
      })

      const result = await mergeTransactionsIntoFile(filePath, [newTx])

      expect(result).toContain('Existing transaction')
      expect(result).toContain('New transaction')
      expect(result).toContain('2024-01-01')
      expect(result).toContain('2024-01-02')
    })

    it('should create new file content when file does not exist', async () => {
      const filePath = path.join(testDir, 'new.beancount')

      const newTx = createMockTransaction({
        date: '2024-01-01',
        narration: 'First transaction',
      })

      const result = await mergeTransactionsIntoFile(filePath, [newTx])

      expect(result).toContain('First transaction')
      expect(result).toContain('2024-01-01')
    })

    it('should sort transactions by date', async () => {
      const filePath = path.join(testDir, 'sorted.beancount')

      const tx1 = createMockTransaction({
        date: '2024-01-03',
        narration: 'Latest',
      })
      const tx2 = createMockTransaction({
        date: '2024-01-01',
        narration: 'Earliest',
      })
      const tx3 = createMockTransaction({
        date: '2024-01-02',
        narration: 'Middle',
      })

      const result = await mergeTransactionsIntoFile(filePath, [tx1, tx2, tx3])

      const lines = result.split('\n')
      const earliestIndex = lines.findIndex((l) => l.includes('Earliest'))
      const middleIndex = lines.findIndex((l) => l.includes('Middle'))
      const latestIndex = lines.findIndex((l) => l.includes('Latest'))

      expect(earliestIndex).toBeLessThan(middleIndex)
      expect(middleIndex).toBeLessThan(latestIndex)
    })

    it('should preserve non-transaction entries', async () => {
      const filePath = path.join(testDir, 'preserve.beancount')
      const existingContent = `; This is a comment

2024-01-01 * "Transaction"
  Assets:Checking  100.00 USD
  Expenses:Food   -100.00 USD
`
      await fs.writeFile(filePath, existingContent)

      const newTx = createMockTransaction({
        date: '2024-01-02',
        narration: 'New',
      })

      const result = await mergeTransactionsIntoFile(filePath, [newTx])

      expect(result).toContain('This is a comment')
    })

    it('should handle empty array of new transactions', async () => {
      const filePath = path.join(testDir, 'empty.beancount')
      const existingContent = `2024-01-01 * "Existing"
  Assets:Checking  100.00 USD
  Expenses:Food   -100.00 USD
`
      await fs.writeFile(filePath, existingContent)

      const result = await mergeTransactionsIntoFile(filePath, [])

      expect(result).toContain('Existing')
      expect(result).toContain('2024-01-01')
    })

    it('should throw FileMergeError for parse errors', async () => {
      const filePath = path.join(testDir, 'invalid.beancount')
      const invalidContent = `2024-01-01 * "Incomplete transaction without postings`
      await fs.writeFile(filePath, invalidContent)

      const newTx = createMockTransaction({
        date: '2024-01-02',
        narration: 'Test',
      })

      await expect(
        mergeTransactionsIntoFile(filePath, [newTx]),
      ).rejects.toThrow(FileMergeError)
    })

    it('should handle multiple new transactions', async () => {
      const filePath = path.join(testDir, 'multiple.beancount')

      const tx1 = createMockTransaction({
        date: '2024-01-01',
        narration: 'First',
      })
      const tx2 = createMockTransaction({
        date: '2024-01-02',
        narration: 'Second',
      })
      const tx3 = createMockTransaction({
        date: '2024-01-03',
        narration: 'Third',
      })

      const result = await mergeTransactionsIntoFile(filePath, [tx1, tx2, tx3])

      expect(result).toContain('First')
      expect(result).toContain('Second')
      expect(result).toContain('Third')
      expect(result).toContain('2024-01-01')
      expect(result).toContain('2024-01-02')
      expect(result).toContain('2024-01-03')
    })

    describe('options', () => {
      describe('addBlankLines', () => {
        it('should add blank lines between transactions when addBlankLines is true', async () => {
          const filePath = path.join(testDir, 'blank-lines.beancount')

          const tx1 = createMockTransaction({
            date: '2024-01-01',
            narration: 'First',
          })
          const tx2 = createMockTransaction({
            date: '2024-01-02',
            narration: 'Second',
          })

          const result = await mergeTransactionsIntoFile(filePath, [tx1, tx2], {
            addBlankLines: true,
          })

          const lines = result.split('\n')
          const firstIndex = lines.findIndex((l) => l.includes('First'))
          const secondIndex = lines.findIndex((l) => l.includes('Second'))

          // There should be blank lines after each transaction
          expect(result).toContain('First')
          expect(result).toContain('Second')

          // Find blank lines between transactions
          const linesBetween = lines.slice(firstIndex, secondIndex)
          const hasBlankLine = linesBetween.some((line) => line.trim() === '')
          expect(hasBlankLine).toBe(true)
        })

        it('should not add blank lines between transactions when addBlankLines is false or undefined', async () => {
          const filePath = path.join(testDir, 'no-blank-lines.beancount')

          const tx1 = createMockTransaction({
            date: '2024-01-01',
            narration: 'First',
          })
          const tx2 = createMockTransaction({
            date: '2024-01-02',
            narration: 'Second',
          })

          // Test with addBlankLines: false
          const resultFalse = await mergeTransactionsIntoFile(
            filePath,
            [tx1, tx2],
            { addBlankLines: false },
          )
          const linesFalse = resultFalse
            .split('\n')
            .filter((l) => l.trim() !== '')
          const firstIndexFalse = linesFalse.findIndex((l) =>
            l.includes('First'),
          )
          const secondIndexFalse = linesFalse.findIndex((l) =>
            l.includes('Second'),
          )
          // Transactions should be close together (only posting lines between)
          expect(secondIndexFalse - firstIndexFalse).toBeLessThan(5)

          // Test with no options
          const resultDefault = await mergeTransactionsIntoFile(filePath, [
            tx1,
            tx2,
          ])
          const linesDefault = resultDefault
            .split('\n')
            .filter((l) => l.trim() !== '')
          const firstIndexDefault = linesDefault.findIndex((l) =>
            l.includes('First'),
          )
          const secondIndexDefault = linesDefault.findIndex((l) =>
            l.includes('Second'),
          )
          expect(secondIndexDefault - firstIndexDefault).toBeLessThan(5)
        })

        it('should add blank line before new transactions when file exists and addBlankLines is true', async () => {
          const filePath = path.join(testDir, 'existing-blank.beancount')
          const existingContent = `2024-01-01 * "Existing"
  Assets:Checking  100.00 USD
  Expenses:Food   -100.00 USD`
          await fs.writeFile(filePath, existingContent)

          const newTx = createMockTransaction({
            date: '2024-01-02',
            narration: 'New transaction',
          })

          const result = await mergeTransactionsIntoFile(filePath, [newTx], {
            addBlankLines: true,
          })

          const lines = result.split('\n')
          const existingIndex = lines.findIndex((l) => l.includes('Existing'))
          const newIndex = lines.findIndex((l) => l.includes('New transaction'))

          // Find the lines between existing and new transactions
          const linesBetween = lines.slice(existingIndex, newIndex)
          const hasBlankLine = linesBetween.some((line) => line.trim() === '')
          expect(hasBlankLine).toBe(true)
        })
      })

      describe('delimiterComment', () => {
        it('should add delimiter comment before new transactions', async () => {
          const filePath = path.join(testDir, 'delimiter.beancount')
          const existingContent = `2024-01-01 * "Existing"
  Assets:Checking  100.00 USD
  Expenses:Food   -100.00 USD`
          await fs.writeFile(filePath, existingContent)

          const newTx = createMockTransaction({
            date: '2024-01-02',
            narration: 'New transaction',
          })

          const result = await mergeTransactionsIntoFile(filePath, [newTx], {
            delimiterComment: '; Imported transactions',
          })

          const lines = result.split('\n')
          const existingIndex = lines.findIndex((l) => l.includes('Existing'))
          const delimiterIndex = lines.findIndex((l) =>
            l.includes('Imported transactions'),
          )
          const newIndex = lines.findIndex((l) => l.includes('New transaction'))

          // Verify delimiter comment appears
          expect(result).toContain('; Imported transactions')

          // Verify it appears after existing and before new transactions
          expect(delimiterIndex).toBeGreaterThan(existingIndex)
          expect(newIndex).toBeGreaterThan(delimiterIndex)
        })

        it('should not add delimiter comment when option is not provided', async () => {
          const filePath = path.join(testDir, 'no-delimiter.beancount')

          const newTx = createMockTransaction({
            date: '2024-01-01',
            narration: 'Transaction',
          })

          const result = await mergeTransactionsIntoFile(filePath, [newTx])

          // Should not contain any delimiter-like comment
          expect(result).not.toContain('; Imported')
          expect(result).not.toContain('delimiter')
        })

        it('should use *** prefix in delimiter comment', async () => {
          const filePath = path.join(testDir, 'prefix-delimiter.beancount')

          const newTx = createMockTransaction({
            date: '2024-01-01',
            narration: 'Transaction',
          })

          const result = await mergeTransactionsIntoFile(filePath, [newTx], {
            delimiterComment: '*** checking.csv',
          })

          expect(result).toContain('*** checking.csv')
        })

        it('should format delimiter with basename of single CSV path', async () => {
          const filePath = path.join(testDir, 'basename-delimiter.beancount')
          const csvPath = '/tmp/full/path/to/checking.csv'

          const newTx = createMockTransaction({
            date: '2024-01-01',
            narration: 'Transaction',
          })

          const result = await mergeTransactionsIntoFile(filePath, [newTx], {
            delimiterComment: `*** ${path.basename(csvPath)}`,
          })

          expect(result).toContain('*** checking.csv')
          expect(result).not.toContain('/tmp/full/path')
        })

        it('should format delimiter with comma-separated basenames for multiple CSVs', async () => {
          const filePath = path.join(testDir, 'multi-csv-delimiter.beancount')
          const csvPaths = [
            '/tmp/data/checking.csv',
            '/tmp/data/savings.csv',
            '/tmp/data/credit-card.csv',
          ]

          const newTx = createMockTransaction({
            date: '2024-01-01',
            narration: 'Transaction',
          })

          const result = await mergeTransactionsIntoFile(filePath, [newTx], {
            delimiterComment: `*** ${csvPaths.map((p) => path.basename(p)).join(', ')}`,
          })

          expect(result).toContain(
            '*** checking.csv, savings.csv, credit-card.csv',
          )
        })

        it('should handle CSV filenames with spaces in delimiter comment', async () => {
          const filePath = path.join(testDir, 'spaces-delimiter.beancount')

          const newTx = createMockTransaction({
            date: '2024-01-01',
            narration: 'Transaction',
          })

          const result = await mergeTransactionsIntoFile(filePath, [newTx], {
            delimiterComment: `*** ${path.basename('/tmp/my bank/checking transactions.csv')}`,
          })

          expect(result).toContain('*** checking transactions.csv')
        })

        it('should handle CSV filenames with special characters', async () => {
          const filePath = path.join(
            testDir,
            'special-chars-delimiter.beancount',
          )

          const newTx = createMockTransaction({
            date: '2024-01-01',
            narration: 'Transaction',
          })

          const result = await mergeTransactionsIntoFile(filePath, [newTx], {
            delimiterComment: `*** ${path.basename('/tmp/data/account-2024_Q1.csv')}`,
          })

          expect(result).toContain('*** account-2024_Q1.csv')
        })

        it('should preserve order of CSV filenames in delimiter', async () => {
          const filePath = path.join(testDir, 'order-delimiter.beancount')
          const csvPaths = ['/a/first.csv', '/b/second.csv', '/c/third.csv']

          const newTx = createMockTransaction({
            date: '2024-01-01',
            narration: 'Transaction',
          })

          const result = await mergeTransactionsIntoFile(filePath, [newTx], {
            delimiterComment: `*** ${csvPaths.map((p) => path.basename(p)).join(', ')}`,
          })

          expect(result).toContain('*** first.csv, second.csv, third.csv')
        })
      })

      describe('combined options', () => {
        it('should combine addBlankLines and delimiterComment options', async () => {
          const filePath = path.join(testDir, 'combined.beancount')
          const existingContent = `2024-01-01 * "Existing"
  Assets:Checking  100.00 USD
  Expenses:Food   -100.00 USD`
          await fs.writeFile(filePath, existingContent)

          const tx1 = createMockTransaction({
            date: '2024-01-02',
            narration: 'First import',
          })
          const tx2 = createMockTransaction({
            date: '2024-01-03',
            narration: 'Second import',
          })

          const result = await mergeTransactionsIntoFile(filePath, [tx1, tx2], {
            addBlankLines: true,
            delimiterComment: '; New imports',
          })

          const lines = result.split('\n')
          const existingIndex = lines.findIndex((l) => l.includes('Existing'))
          const delimiterIndex = lines.findIndex((l) =>
            l.includes('New imports'),
          )
          const firstIndex = lines.findIndex((l) => l.includes('First import'))
          const secondIndex = lines.findIndex((l) =>
            l.includes('Second import'),
          )

          // Verify delimiter comment is present
          expect(result).toContain('; New imports')

          // Verify blank line exists before delimiter (from existing content)
          const beforeDelimiter = lines.slice(existingIndex, delimiterIndex)
          expect(beforeDelimiter.some((line) => line.trim() === '')).toBe(true)

          // Verify blank line exists after delimiter
          const afterDelimiter = lines.slice(delimiterIndex, firstIndex)
          expect(afterDelimiter.some((line) => line.trim() === '')).toBe(true)

          // Verify blank lines exist between transactions
          const betweenTransactions = lines.slice(firstIndex, secondIndex)
          expect(betweenTransactions.some((line) => line.trim() === '')).toBe(
            true,
          )
        })

        it('should handle delimiter comment without blank lines', async () => {
          const filePath = path.join(testDir, 'delimiter-no-blank.beancount')
          const existingContent = `2024-01-01 * "Existing"
  Assets:Checking  100.00 USD
  Expenses:Food   -100.00 USD`
          await fs.writeFile(filePath, existingContent)

          const newTx = createMockTransaction({
            date: '2024-01-02',
            narration: 'New transaction',
          })

          const result = await mergeTransactionsIntoFile(filePath, [newTx], {
            addBlankLines: false,
            delimiterComment: '; Imports',
          })

          // Verify delimiter comment is present
          expect(result).toContain('; Imports')

          const lines = result.split('\n')
          const delimiterIndex = lines.findIndex((l) => l.includes('; Imports'))
          const transactionIndex = lines.findIndex((l) =>
            l.includes('2024-01-02'),
          )

          // Delimiter should come before the transaction
          expect(delimiterIndex).toBeGreaterThan(-1)
          expect(transactionIndex).toBeGreaterThan(delimiterIndex)
        })
      })

      describe('edge cases', () => {
        it('should handle options with empty existing file', async () => {
          const filePath = path.join(testDir, 'empty-with-options.beancount')
          // File doesn't exist, no need to create it

          const tx1 = createMockTransaction({
            date: '2024-01-01',
            narration: 'First',
          })
          const tx2 = createMockTransaction({
            date: '2024-01-02',
            narration: 'Second',
          })

          const result = await mergeTransactionsIntoFile(filePath, [tx1, tx2], {
            addBlankLines: true,
            delimiterComment: '; Initial imports',
          })

          const lines = result.split('\n')
          const delimiterIndex = lines.findIndex((l) =>
            l.includes('Initial imports'),
          )
          const firstIndex = lines.findIndex((l) => l.includes('First'))
          const secondIndex = lines.findIndex((l) => l.includes('Second'))

          // Verify delimiter comment is present
          expect(result).toContain('; Initial imports')

          // Verify transactions are present
          expect(result).toContain('First')
          expect(result).toContain('Second')

          // Verify blank lines exist between transactions
          const betweenTransactions = lines.slice(firstIndex, secondIndex)
          expect(betweenTransactions.some((line) => line.trim() === '')).toBe(
            true,
          )

          // Verify delimiter comes before transactions
          expect(delimiterIndex).toBeGreaterThan(-1)
          expect(firstIndex).toBeGreaterThan(delimiterIndex)
        })
      })
    })
  })
})
