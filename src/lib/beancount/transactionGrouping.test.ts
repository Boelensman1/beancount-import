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
    importerCommand: 'importer',
    defaultOutputFile: '/path/to/default.beancount',
    rules: [],
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
            processedTransaction: JSON.stringify(tx1.toJSON()),
            matchedRules: [],
            warnings: [],
          },
          {
            id: 'tx-2',
            originalTransaction: '',
            processedTransaction: JSON.stringify(tx2.toJSON()),
            matchedRules: [],
            warnings: [],
          },
          {
            id: 'tx-3',
            originalTransaction: '',
            processedTransaction: JSON.stringify(tx3.toJSON()),
            matchedRules: [],
            warnings: [],
          },
        ],
        transactionCount: 3,
      },
    ]

    const accounts: Account[] = [mockAccount]

    const groups = groupTransactionsByOutputFile(imports, accounts)

    expect(groups).toHaveLength(2)

    const group1 = groups.find(
      (g) => g.outputFile === '/path/to/file1.beancount',
    )
    expect(group1).toBeDefined()
    expect(group1!.transactions).toHaveLength(2)
    expect(group1!.transactionIds).toEqual(['tx-1', 'tx-2'])
    expect(group1!.accountId).toBe('account-1')
    expect(group1!.accountName).toBe('Checking Account')

    const group2 = groups.find(
      (g) => g.outputFile === '/path/to/file2.beancount',
    )
    expect(group2).toBeDefined()
    expect(group2!.transactions).toHaveLength(1)
    expect(group2!.transactionIds).toEqual(['tx-3'])
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
            processedTransaction: JSON.stringify(tx1.toJSON()),
            matchedRules: [],
            warnings: [],
          },
          {
            id: 'tx-2',
            originalTransaction: '',
            processedTransaction: JSON.stringify(tx2.toJSON()),
            matchedRules: [],
            warnings: [],
          },
        ],
        transactionCount: 2,
      },
    ]

    const accounts: Account[] = [mockAccount]

    const groups = groupTransactionsByOutputFile(imports, accounts)

    expect(groups).toHaveLength(1)
    expect(groups[0].outputFile).toBe('/path/to/default.beancount')
    expect(groups[0].transactions).toHaveLength(2)
  })

  it('should handle multiple accounts', () => {
    const tx1 = createTransaction('2024-01-01', 'Transaction 1')
    const tx2 = createTransaction('2024-01-02', 'Transaction 2')

    const account1: Account = {
      id: 'account-1',
      name: 'Checking',
      importerCommand: 'importer',
      defaultOutputFile: '/path/to/checking.beancount',
      rules: [],
    }

    const account2: Account = {
      id: 'account-2',
      name: 'Savings',
      importerCommand: 'importer',
      defaultOutputFile: '/path/to/savings.beancount',
      rules: [],
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
            processedTransaction: JSON.stringify(tx1.toJSON()),
            matchedRules: [],
            warnings: [],
          },
        ],
        transactionCount: 1,
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
            processedTransaction: JSON.stringify(tx2.toJSON()),
            matchedRules: [],
            warnings: [],
          },
        ],
        transactionCount: 1,
      },
    ]

    const accounts: Account[] = [account1, account2]

    const groups = groupTransactionsByOutputFile(imports, accounts)

    expect(groups).toHaveLength(2)
    expect(
      groups.find((g) => g.outputFile === '/path/to/checking.beancount'),
    ).toBeDefined()
    expect(
      groups.find((g) => g.outputFile === '/path/to/savings.beancount'),
    ).toBeDefined()
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
            processedTransaction: JSON.stringify(tx1.toJSON()),
            matchedRules: [],
            warnings: [],
          },
          {
            id: 'tx-2',
            originalTransaction: '',
            processedTransaction: JSON.stringify(tx2.toJSON()),
            matchedRules: [],
            warnings: [],
          },
          {
            id: 'tx-3',
            originalTransaction: '',
            processedTransaction: JSON.stringify(tx3.toJSON()),
            matchedRules: [],
            warnings: [],
          },
        ],
        transactionCount: 3,
      },
    ]

    const accounts: Account[] = [mockAccount]

    const groups = groupTransactionsByOutputFile(imports, accounts)

    expect(groups).toHaveLength(3)
    expect(
      groups.find((g) => g.outputFile === '/path/to/personal.beancount')
        ?.transactions,
    ).toHaveLength(1)
    expect(
      groups.find((g) => g.outputFile === '/path/to/business.beancount')
        ?.transactions,
    ).toHaveLength(1)
    expect(
      groups.find((g) => g.outputFile === '/path/to/default.beancount')
        ?.transactions,
    ).toHaveLength(1)
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
            processedTransaction: JSON.stringify(tx1.toJSON()),
            matchedRules: [],
            warnings: [],
          },
        ],
        transactionCount: 1,
      },
    ]

    const accounts: Account[] = [mockAccount]

    expect(() => groupTransactionsByOutputFile(imports, accounts)).toThrow(
      /Account not found/,
    )
  })
})
