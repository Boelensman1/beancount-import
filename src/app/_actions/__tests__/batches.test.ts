import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createBatch, getBatchResult } from '../batches'
import { getDb } from '@/lib/db/db'
import { createMockDb, setupDbMock } from '@/test/mocks/db'
import {
  createMockGoCardless,
  setupGoCardlessMock,
} from '@/test/mocks/goCardless'
import { getGoCardless } from '@/lib/goCardless/goCardless'
import { createMockGoCardlessConfig } from '@/test/test-utils'
import { Temporal } from '@js-temporal/polyfill'
import path from 'path'
import { runImport } from '@/app/_actions/imports'

// Test constants for account IDs (valid UUIDs)
const TEST_ACCOUNT_ID_1 = '00000000-0000-4000-8000-000000000001'
const TEST_ACCOUNT_ID_2 = '00000000-0000-4000-8000-000000000002'
const TEST_BATCH_ID_1 = '10000000-0000-4000-8000-000000000001'
const TEST_IMPORT_ID_1 = '20000000-0000-4000-8000-000000000001'
const TEST_IMPORT_ID_2 = '20000000-0000-4000-8000-000000000002'

// Helper to read stream to completion
async function readStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let result = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value, { stream: true })
  }

  return result
}

describe('createBatch', () => {
  beforeEach(() => {
    setupDbMock()
  })

  it('should create a batch with given account IDs', async () => {
    const mockDb = createMockDb()
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const accountIds = [TEST_ACCOUNT_ID_1, TEST_ACCOUNT_ID_2]
    const batchId = await createBatch(accountIds)

    expect(batchId).toBeDefined()
    expect(mockDb.data.batches).toBeDefined()
    expect(mockDb.data.batches?.length).toBe(1)

    const batch = mockDb.data.batches?.[0]
    expect(batch).toMatchObject({
      id: batchId,
      accountIds,
      importIds: [],
    })
    expect(batch?.timestamp).toBeDefined()
  })

  it('should create a batch with single account', async () => {
    const mockDb = createMockDb()
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const accountIds = [TEST_ACCOUNT_ID_1]
    const batchId = await createBatch(accountIds)

    expect(batchId).toBeDefined()
    expect(mockDb.data.batches?.[0]?.accountIds).toEqual(accountIds)
  })
})

describe('getBatchResult', () => {
  beforeEach(() => {
    setupDbMock()
  })

  it('should return batch with its imports', async () => {
    const mockBatch = {
      id: TEST_BATCH_ID_1,
      timestamp: '2024-01-15T10:00:00.000Z',
      importIds: [TEST_IMPORT_ID_1, TEST_IMPORT_ID_2],
      accountIds: [TEST_ACCOUNT_ID_1, TEST_ACCOUNT_ID_2],
      completedCount: 2,
    }

    const mockImports = [
      {
        id: TEST_IMPORT_ID_1,
        accountId: TEST_ACCOUNT_ID_1,
        batchId: TEST_BATCH_ID_1,
        timestamp: '2024-01-15T10:00:00.000Z',
        transactions: [],
        transactionCount: 5,
      },
      {
        id: TEST_IMPORT_ID_2,
        accountId: TEST_ACCOUNT_ID_2,
        batchId: TEST_BATCH_ID_1,
        timestamp: '2024-01-15T10:00:00.000Z',
        transactions: [],
        transactionCount: 3,
      },
    ]

    const mockDb = createMockDb({
      batches: [mockBatch],
      imports: mockImports,
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await getBatchResult(TEST_BATCH_ID_1)

    expect(result).toBeDefined()
    expect(result?.batch).toEqual(mockBatch)
    expect(result?.imports).toHaveLength(2)
    expect(result?.imports).toEqual(mockImports)
  })

  it('should return null when batch not found', async () => {
    const mockDb = createMockDb({
      batches: [],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await getBatchResult('nonexistent-batch')

    expect(result).toBeNull()
  })

  it('should return empty imports array when batch has no imports yet', async () => {
    const mockBatch = {
      id: TEST_BATCH_ID_1,
      timestamp: '2024-01-15T10:00:00.000Z',
      importIds: [],
      accountIds: [TEST_ACCOUNT_ID_1],
      completedCount: 0,
    }

    const mockDb = createMockDb({
      batches: [mockBatch],
      imports: [],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await getBatchResult(TEST_BATCH_ID_1)

    expect(result).toBeDefined()
    expect(result?.batch).toEqual(mockBatch)
    expect(result?.imports).toEqual([])
  })
})

describe('Batch management with failed imports', () => {
  beforeEach(() => {
    setupDbMock()
    setupGoCardlessMock()
  })

  it('should not create batch when all imports fail', async () => {
    const mockDb = createMockDb({
      config: {
        defaults: {
          beangulpCommand: 'exit 1',
        },
        accounts: [
          {
            id: TEST_ACCOUNT_ID_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            goCardless: createMockGoCardlessConfig(),
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    // Mock GoCardless to return sample transactions
    const mockGoCardless = createMockGoCardless()
    mockGoCardless.getTransationsForAccounts.mockResolvedValue([
      {
        transactionId: 'tx1',
        bookingDate: Temporal.PlainDate.from('2024-01-15'),
        valueDate: Temporal.PlainDate.from('2024-01-15'),
        transactionAmount: { amount: '-10.00', currency: 'USD' },
        creditorName: 'Test Merchant',
        remittanceInformationUnstructured: 'Test transaction',
      },
    ])
    vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

    // Create batch
    const batchId = await createBatch([TEST_ACCOUNT_ID_1])

    // Verify batch was created with completedCount = 0
    expect(mockDb.data.batches?.length ?? 0).toBe(1)
    expect(mockDb.data.batches?.[0].completedCount).toBe(0)

    // Run import (which will fail due to beangulpCommand exit 1)
    const stream = await runImport(TEST_ACCOUNT_ID_1, batchId)
    await readStream(stream)

    // Verify no imports were saved
    expect(mockDb.data.imports?.length ?? 0).toBe(0)

    // Verify batch was automatically deleted (completedCount reached accountIds.length with no successes)
    expect(mockDb.data.batches?.length ?? 0).toBe(0)
  })

  it('should keep batch when at least one import succeeds', async () => {
    const fixturePathValid = path.join(
      __dirname,
      '../../../test/fixtures/valid-beancount.txt',
    )
    const mockDb = createMockDb({
      config: {
        defaults: {
          beangulpCommand: `cat ${fixturePathValid}`,
        },
        accounts: [
          {
            id: TEST_ACCOUNT_ID_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            goCardless: createMockGoCardlessConfig(),
          },
          {
            id: TEST_ACCOUNT_ID_2,
            name: 'savings',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/savings.beancount',
            rules: [],
            goCardless: createMockGoCardlessConfig(),
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    // Mock GoCardless to return sample transactions
    const mockGoCardless = createMockGoCardless()
    mockGoCardless.getTransationsForAccounts.mockResolvedValue([
      {
        transactionId: 'tx1',
        bookingDate: Temporal.PlainDate.from('2024-01-15'),
        valueDate: Temporal.PlainDate.from('2024-01-15'),
        transactionAmount: { amount: '-10.00', currency: 'USD' },
        creditorName: 'Test Merchant',
        remittanceInformationUnstructured: 'Test transaction',
      },
    ])
    vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

    // Create batch for both accounts
    const batchId = await createBatch([TEST_ACCOUNT_ID_1, TEST_ACCOUNT_ID_2])

    // Run first import (will succeed - beangulpCommand outputs valid beancount)
    const stream1 = await runImport(TEST_ACCOUNT_ID_1, batchId)
    await readStream(stream1)

    // Mock second account to fail (no transactions)
    mockGoCardless.getTransationsForAccounts.mockResolvedValue([])

    // Run second import (will fail - no transactions)
    const stream2 = await runImport(TEST_ACCOUNT_ID_2, batchId)
    await readStream(stream2)

    // Verify one import was saved (the successful one)
    expect(mockDb.data.imports?.length ?? 0).toBe(1)

    // Verify batch still exists because one import succeeded
    expect(mockDb.data.batches?.length ?? 0).toBe(1)
    const batch = mockDb.data.batches?.[0]
    expect(batch?.importIds.length).toBe(1)
    expect(batch?.completedCount).toBe(2) // Both imports completed
  })
})
