import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getAccounts, getAccountsWithPendingImports } from '../accounts'
import { getDb } from '@/lib/db/db'
import { createMockDb, setupDbMock } from '@/test/mocks/db'

// Test constants for account IDs (valid UUIDs)
const TEST_ACCOUNT_ID_1 = '00000000-0000-4000-8000-000000000001'
const TEST_ACCOUNT_ID_2 = '00000000-0000-4000-8000-000000000002'
const TEST_IMPORT_ID_1 = '20000000-0000-4000-8000-000000000001'
const TEST_BATCH_ID_1 = '10000000-0000-4000-8000-000000000001'

describe('getAccounts', () => {
  beforeEach(() => {
    setupDbMock()
  })

  it('should return accounts from database', async () => {
    // Setup mock database with test accounts
    const mockDb = createMockDb({
      config: {
        defaults: {
          beangulpCommand: '',
        },
        accounts: [
          {
            id: TEST_ACCOUNT_ID_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
          },
          {
            id: TEST_ACCOUNT_ID_2,
            name: 'savings',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/savings.beancount',
            rules: [],
            variables: [],
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const accounts = await getAccounts()

    expect(accounts).toEqual([
      {
        id: TEST_ACCOUNT_ID_1,
        name: 'checking',
        csvFilename: 'csv.csv',
        defaultOutputFile: '/tmp/checking.beancount',
        rules: [],
        variables: [],
      },
      {
        id: TEST_ACCOUNT_ID_2,
        name: 'savings',
        csvFilename: 'csv.csv',
        defaultOutputFile: '/tmp/savings.beancount',
        rules: [],
        variables: [],
      },
    ])
  })

  it('should return empty array when no accounts exist', async () => {
    // Setup mock database with no accounts
    const mockDb = createMockDb()
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const accounts = await getAccounts()

    expect(accounts).toEqual([])
  })
})

describe('getAccountsWithPendingImports', () => {
  beforeEach(() => {
    setupDbMock()
  })

  it('should return accounts with hasPendingImport=false when no pending imports', async () => {
    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_ACCOUNT_ID_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
          },
        ],
      },
      imports: [],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const accounts = await getAccountsWithPendingImports()

    expect(accounts).toHaveLength(1)
    expect(accounts[0].hasPendingImport).toBe(false)
  })

  it('should return accounts with hasPendingImport=true when import exists', async () => {
    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_ACCOUNT_ID_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
          },
          {
            id: TEST_ACCOUNT_ID_2,
            name: 'savings',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/savings.beancount',
            rules: [],
            variables: [],
          },
        ],
      },
      imports: [
        {
          id: TEST_IMPORT_ID_1,
          accountId: TEST_ACCOUNT_ID_1,
          batchId: TEST_BATCH_ID_1,
          timestamp: new Date().toISOString(),
          transactions: [],
          transactionCount: 0,
          csvPath: '/tmp/test.csv',
        },
      ],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const accounts = await getAccountsWithPendingImports()

    const checking = accounts.find((a) => a.id === TEST_ACCOUNT_ID_1)
    const savings = accounts.find((a) => a.id === TEST_ACCOUNT_ID_2)

    expect(checking?.hasPendingImport).toBe(true)
    expect(savings?.hasPendingImport).toBe(false)
  })

  it('should handle empty imports array', async () => {
    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_ACCOUNT_ID_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
          },
        ],
      },
      imports: [],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const accounts = await getAccountsWithPendingImports()

    expect(accounts).toHaveLength(1)
    expect(accounts[0].hasPendingImport).toBe(false)
  })
})
