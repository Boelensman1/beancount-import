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
  })
})
