import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getAccounts } from '../accounts'
import { getDb } from '@/lib/db/db'
import { createMockDb, setupDbMock } from '@/test/mocks/db'

// Test constants for account IDs (valid UUIDs)
const TEST_ACCOUNT_ID_1 = '00000000-0000-4000-8000-000000000001'
const TEST_ACCOUNT_ID_2 = '00000000-0000-4000-8000-000000000002'

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
          },
          {
            id: TEST_ACCOUNT_ID_2,
            name: 'savings',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/savings.beancount',
            rules: [],
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
      },
      {
        id: TEST_ACCOUNT_ID_2,
        name: 'savings',
        csvFilename: 'csv.csv',
        defaultOutputFile: '/tmp/savings.beancount',
        rules: [],
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
