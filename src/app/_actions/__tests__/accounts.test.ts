import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getAccounts, getAccountsWithPendingImports } from '../accounts'
import { getDb } from '@/lib/db/db'
import { createMockDb, setupDbMock } from '@/test/mocks/db'
import { TEST_IDS } from '@/test/test-utils'

// Use TEST_IDS from test-utils for consistent test constants
const TEST_ACCOUNT_ID_1 = TEST_IDS.ACCOUNT_1
const TEST_ACCOUNT_ID_2 = TEST_IDS.ACCOUNT_2
const TEST_IMPORT_ID_1 = TEST_IDS.IMPORT_1

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
