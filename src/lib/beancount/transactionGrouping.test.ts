import { describe, it, expect } from 'vitest'
import { groupTransactionsByOutputFile } from './transactionGrouping'
import { createMockTransaction } from '@/test/test-utils'
import type { ImportResult, Account } from '../db/types'

describe('transactionGrouping', () => {
  const createTransaction = (
    date: string,
    narration: string,
    outputFile?: string,
  ) => {
    const tx = createMockTransaction({ date, narration })

    if (outputFile) {
      tx.internalMetadata.outputFile = outputFile
    }

    return tx
  }

  const mockAccount: Account = {
    id: 'account-1',
    name: 'Checking Account',
    csvFilename: 'csv.csv',
    defaultOutputFile: '/path/to/default.beancount',
    rules: [],
    variables: [],
  }

  it('should group transactions by outputFile from internalMetadata', () => {
    const tx1 = createTransaction(
      '2024-01-01',
      'Transaction 1',
      '/path/to/file1.beancount',
    )
    const tx2 = createTransaction(
      '2024-01-02',
      'Transaction 2',
      '/path/to/file1.beancount',
    )
    const tx3 = createTransaction(
      '2024-01-03',
      'Transaction 3',
      '/path/to/file2.beancount',
    )

    const imports: ImportResult[] = [
      {
        id: 'import-1',
        accountId: 'account-1',
        batchId: 'batch-1',
        timestamp: new Date().toISOString(),
        transactions: [
          {
            id: 'tx-1',
            originalTransaction: '',
            processedEntries: JSON.stringify([tx1.toJSON()]),
            matchedRules: [],
            warnings: [],
          },
          {
            id: 'tx-2',
            originalTransaction: '',
            processedEntries: JSON.stringify([tx2.toJSON()]),
            matchedRules: [],
            warnings: [],
          },
          {
            id: 'tx-3',
            originalTransaction: '',
            processedEntries: JSON.stringify([tx3.toJSON()]),
            matchedRules: [],
            warnings: [],
          },
        ],
        transactionCount: 3,
        csvPath: '/tmp/test.csv',
      },
    ]

    const accounts: Account[] = [mockAccount]

    const groups = groupTransactionsByOutputFile(imports, accounts)

    expect(groups).toHaveLength(2)

    const group1 = groups.find(
      (g) => g.outputFile === '/path/to/file1.beancount',
    )
    expect(group1).toBeDefined()
    expect(group1!.entries).toHaveLength(2)
    expect(group1!.transactionIds).toEqual(['tx-1', 'tx-2'])
    expect(group1!.csvFilePaths).toEqual(['/tmp/test.csv', '/tmp/test.csv'])
    expect(group1!.accountId).toBe('account-1')
    expect(group1!.accountName).toBe('Checking Account')

    const group2 = groups.find(
      (g) => g.outputFile === '/path/to/file2.beancount',
    )
    expect(group2).toBeDefined()
    expect(group2!.entries).toHaveLength(1)
    expect(group2!.transactionIds).toEqual(['tx-3'])
    expect(group2!.csvFilePaths).toEqual(['/tmp/test.csv'])
  })

  it('should fall back to defaultOutputFile when outputFile not set', () => {
    const tx1 = createTransaction('2024-01-01', 'Transaction 1')
    const tx2 = createTransaction('2024-01-02', 'Transaction 2')

    const imports: ImportResult[] = [
      {
        id: 'import-1',
        accountId: 'account-1',
        batchId: 'batch-1',
        timestamp: new Date().toISOString(),
        transactions: [
          {
            id: 'tx-1',
            originalTransaction: '',
            processedEntries: JSON.stringify([tx1.toJSON()]),
            matchedRules: [],
            warnings: [],
          },
          {
            id: 'tx-2',
            originalTransaction: '',
            processedEntries: JSON.stringify([tx2.toJSON()]),
            matchedRules: [],
            warnings: [],
          },
        ],
        transactionCount: 2,
        csvPath: '/tmp/test.csv',
      },
    ]

    const accounts: Account[] = [mockAccount]

    const groups = groupTransactionsByOutputFile(imports, accounts)

    expect(groups).toHaveLength(1)
    expect(groups[0].outputFile).toBe('/path/to/default.beancount')
    expect(groups[0].entries).toHaveLength(2)
    expect(groups[0].csvFilePaths).toEqual(['/tmp/test.csv', '/tmp/test.csv'])
  })

  it('should handle multiple accounts', () => {
    const tx1 = createTransaction('2024-01-01', 'Transaction 1')
    const tx2 = createTransaction('2024-01-02', 'Transaction 2')

    const account1: Account = {
      id: 'account-1',
      name: 'Checking',
      csvFilename: 'csv.csv',
      defaultOutputFile: '/path/to/checking.beancount',
      rules: [],
      variables: [],
    }

    const account2: Account = {
      id: 'account-2',
      name: 'Savings',
      csvFilename: 'csv.csv',
      defaultOutputFile: '/path/to/savings.beancount',
      rules: [],
      variables: [],
    }

    const imports: ImportResult[] = [
      {
        id: 'import-1',
        accountId: 'account-1',
        batchId: 'batch-1',
        timestamp: new Date().toISOString(),
        transactions: [
          {
            id: 'tx-1',
            originalTransaction: '',
            processedEntries: JSON.stringify([tx1.toJSON()]),
            matchedRules: [],
            warnings: [],
          },
        ],
        transactionCount: 1,
        csvPath: '/tmp/test1.csv',
      },
      {
        id: 'import-2',
        accountId: 'account-2',
        batchId: 'batch-1',
        timestamp: new Date().toISOString(),
        transactions: [
          {
            id: 'tx-2',
            originalTransaction: '',
            processedEntries: JSON.stringify([tx2.toJSON()]),
            matchedRules: [],
            warnings: [],
          },
        ],
        transactionCount: 1,
        csvPath: '/tmp/test2.csv',
      },
    ]

    const accounts: Account[] = [account1, account2]

    const groups = groupTransactionsByOutputFile(imports, accounts)

    expect(groups).toHaveLength(2)

    const checkingGroup = groups.find(
      (g) => g.outputFile === '/path/to/checking.beancount',
    )
    expect(checkingGroup).toBeDefined()
    expect(checkingGroup!.csvFilePaths).toEqual(['/tmp/test1.csv'])

    const savingsGroup = groups.find(
      (g) => g.outputFile === '/path/to/savings.beancount',
    )
    expect(savingsGroup).toBeDefined()
    expect(savingsGroup!.csvFilePaths).toEqual(['/tmp/test2.csv'])
  })

  it('should handle single account with multiple output files from rules', () => {
    const tx1 = createTransaction(
      '2024-01-01',
      'Personal',
      '/path/to/personal.beancount',
    )
    const tx2 = createTransaction(
      '2024-01-02',
      'Business',
      '/path/to/business.beancount',
    )
    const tx3 = createTransaction('2024-01-03', 'Default')

    const imports: ImportResult[] = [
      {
        id: 'import-1',
        accountId: 'account-1',
        batchId: 'batch-1',
        timestamp: new Date().toISOString(),
        transactions: [
          {
            id: 'tx-1',
            originalTransaction: '',
            processedEntries: JSON.stringify([tx1.toJSON()]),
            matchedRules: [],
            warnings: [],
          },
          {
            id: 'tx-2',
            originalTransaction: '',
            processedEntries: JSON.stringify([tx2.toJSON()]),
            matchedRules: [],
            warnings: [],
          },
          {
            id: 'tx-3',
            originalTransaction: '',
            processedEntries: JSON.stringify([tx3.toJSON()]),
            matchedRules: [],
            warnings: [],
          },
        ],
        transactionCount: 3,
        csvPath: '/tmp/test.csv',
      },
    ]

    const accounts: Account[] = [mockAccount]

    const groups = groupTransactionsByOutputFile(imports, accounts)

    expect(groups).toHaveLength(3)

    const personalGroup = groups.find(
      (g) => g.outputFile === '/path/to/personal.beancount',
    )
    expect(personalGroup?.entries).toHaveLength(1)
    expect(personalGroup?.csvFilePaths).toEqual(['/tmp/test.csv'])

    const businessGroup = groups.find(
      (g) => g.outputFile === '/path/to/business.beancount',
    )
    expect(businessGroup?.entries).toHaveLength(1)
    expect(businessGroup?.csvFilePaths).toEqual(['/tmp/test.csv'])

    const defaultGroup = groups.find(
      (g) => g.outputFile === '/path/to/default.beancount',
    )
    expect(defaultGroup?.entries).toHaveLength(1)
    expect(defaultGroup?.csvFilePaths).toEqual(['/tmp/test.csv'])
  })

  it('should handle empty imports array', () => {
    const imports: ImportResult[] = []
    const accounts: Account[] = [mockAccount]

    const groups = groupTransactionsByOutputFile(imports, accounts)

    expect(groups).toHaveLength(0)
  })

  it('should throw error when account not found', () => {
    const tx1 = createTransaction('2024-01-01', 'Transaction 1')

    const imports: ImportResult[] = [
      {
        id: 'import-1',
        accountId: 'nonexistent-account',
        batchId: 'batch-1',
        timestamp: new Date().toISOString(),
        transactions: [
          {
            id: 'tx-1',
            originalTransaction: '',
            processedEntries: JSON.stringify([tx1.toJSON()]),
            matchedRules: [],
            warnings: [],
          },
        ],
        transactionCount: 1,
        csvPath: '/tmp/test.csv',
      },
    ]

    const accounts: Account[] = [mockAccount]

    expect(() => groupTransactionsByOutputFile(imports, accounts)).toThrow(
      /Account not found/,
    )
  })

  it('should not deduplicate csvFilePaths when multiple transactions from same CSV', () => {
    const tx1 = createTransaction('2024-01-01', 'Transaction 1')
    const tx2 = createTransaction('2024-01-02', 'Transaction 2')
    const tx3 = createTransaction('2024-01-03', 'Transaction 3')

    const imports: ImportResult[] = [
      {
        id: 'import-1',
        accountId: 'account-1',
        batchId: 'batch-1',
        timestamp: new Date().toISOString(),
        transactions: [
          {
            id: 'tx-1',
            originalTransaction: '',
            processedEntries: JSON.stringify([tx1.toJSON()]),
            matchedRules: [],
            warnings: [],
          },
          {
            id: 'tx-2',
            originalTransaction: '',
            processedEntries: JSON.stringify([tx2.toJSON()]),
            matchedRules: [],
            warnings: [],
          },
          {
            id: 'tx-3',
            originalTransaction: '',
            processedEntries: JSON.stringify([tx3.toJSON()]),
            matchedRules: [],
            warnings: [],
          },
        ],
        transactionCount: 3,
        csvPath: '/tmp/data/checking.csv',
      },
    ]

    const accounts: Account[] = [mockAccount]

    const groups = groupTransactionsByOutputFile(imports, accounts)

    expect(groups).toHaveLength(1)
    expect(groups[0].csvFilePaths).toHaveLength(3)
    expect(groups[0].csvFilePaths).toEqual([
      '/tmp/data/checking.csv',
      '/tmp/data/checking.csv',
      '/tmp/data/checking.csv',
    ])
  })

  it('should track csvFilePaths from multiple different CSV files in same group', () => {
    const tx1 = createTransaction('2024-01-01', 'Transaction 1')
    const tx2 = createTransaction('2024-01-02', 'Transaction 2')
    const tx3 = createTransaction('2024-01-03', 'Transaction 3')
    const tx4 = createTransaction('2024-01-04', 'Transaction 4')

    const account1: Account = {
      id: 'account-1',
      name: 'Checking',
      csvFilename: 'csv.csv',
      defaultOutputFile: '/path/to/combined.beancount',
      rules: [],
      variables: [],
    }

    const account2: Account = {
      id: 'account-2',
      name: 'Savings',
      csvFilename: 'csv.csv',
      defaultOutputFile: '/path/to/combined.beancount',
      rules: [],
      variables: [],
    }

    const imports: ImportResult[] = [
      {
        id: 'import-1',
        accountId: 'account-1',
        batchId: 'batch-1',
        timestamp: new Date().toISOString(),
        transactions: [
          {
            id: 'tx-1',
            originalTransaction: '',
            processedEntries: JSON.stringify([tx1.toJSON()]),
            matchedRules: [],
            warnings: [],
          },
          {
            id: 'tx-2',
            originalTransaction: '',
            processedEntries: JSON.stringify([tx2.toJSON()]),
            matchedRules: [],
            warnings: [],
          },
        ],
        transactionCount: 2,
        csvPath: '/tmp/full/path/to/checking.csv',
      },
      {
        id: 'import-2',
        accountId: 'account-2',
        batchId: 'batch-1',
        timestamp: new Date().toISOString(),
        transactions: [
          {
            id: 'tx-3',
            originalTransaction: '',
            processedEntries: JSON.stringify([tx3.toJSON()]),
            matchedRules: [],
            warnings: [],
          },
          {
            id: 'tx-4',
            originalTransaction: '',
            processedEntries: JSON.stringify([tx4.toJSON()]),
            matchedRules: [],
            warnings: [],
          },
        ],
        transactionCount: 2,
        csvPath: '/tmp/full/path/to/savings.csv',
      },
    ]

    const accounts: Account[] = [account1, account2]

    const groups = groupTransactionsByOutputFile(imports, accounts)

    expect(groups).toHaveLength(1)
    expect(groups[0].csvFilePaths).toHaveLength(4)
    expect(groups[0].csvFilePaths).toEqual([
      '/tmp/full/path/to/checking.csv',
      '/tmp/full/path/to/checking.csv',
      '/tmp/full/path/to/savings.csv',
      '/tmp/full/path/to/savings.csv',
    ])
  })

  it('should preserve full paths in csvFilePaths including directories', () => {
    const tx1 = createTransaction('2024-01-01', 'Transaction 1')

    const imports: ImportResult[] = [
      {
        id: 'import-1',
        accountId: 'account-1',
        batchId: 'batch-1',
        timestamp: new Date().toISOString(),
        transactions: [
          {
            id: 'tx-1',
            originalTransaction: '',
            processedEntries: JSON.stringify([tx1.toJSON()]),
            matchedRules: [],
            warnings: [],
          },
        ],
        transactionCount: 1,
        csvPath: '/very/long/nested/directory/structure/transactions.csv',
      },
    ]

    const accounts: Account[] = [mockAccount]

    const groups = groupTransactionsByOutputFile(imports, accounts)

    expect(groups).toHaveLength(1)
    expect(groups[0].csvFilePaths).toHaveLength(1)
    expect(groups[0].csvFilePaths[0]).toBe(
      '/very/long/nested/directory/structure/transactions.csv',
    )
    // Verify full path is preserved (not just basename)
    expect(groups[0].csvFilePaths[0]).toContain('/')
    expect(groups[0].csvFilePaths[0]).toContain('very/long/nested')
  })
})
