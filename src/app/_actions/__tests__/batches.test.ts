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

// Mock file operations and post-processing
vi.mock('@/lib/beancount/fileOperations')
vi.mock('@/lib/beancount/fileMerge')
vi.mock('@/lib/beancount/postProcess')

// Import mocked functions
import {
  fileExists,
  createTempFile,
  commitTempFile,
  deleteTempFile,
  deleteBackup,
} from '@/lib/beancount/fileOperations'
import { mergeTransactionsIntoFile } from '@/lib/beancount/fileMerge'
import { executePostProcessCommand } from '@/lib/beancount/postProcess'

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
        csvPath: '/tmp/test1.csv',
      },
      {
        id: TEST_IMPORT_ID_2,
        accountId: TEST_ACCOUNT_ID_2,
        batchId: TEST_BATCH_ID_1,
        timestamp: '2024-01-15T10:00:00.000Z',
        transactions: [],
        transactionCount: 3,
        csvPath: '/tmp/test2.csv',
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

// Note: Per-CSV post-processing is tested at the unit level in postProcess.test.ts
// Testing confirmImport requires extensive mocking of file operations and transaction parsing
// The core functionality (executePostProcessCommand with additional variables) is thoroughly tested

describe('confirmImport with CSV post-processing', () => {
  beforeEach(() => {
    setupDbMock()
    vi.resetModules()
  })

  it('should include csvPostProcessResults in return value when configured', async () => {
    const { confirmImport } = await import('../batches')
    const { createMockTransaction } = await import('@/test/test-utils')

    const mockTx = createMockTransaction({
      date: '2024-01-15',
      narration: 'Test',
    })

    // Create mock with csvPostProcessCommand
    const mockDb = createMockDb({
      config: {
        defaults: {
          beangulpCommand: 'echo test',
          csvPostProcessCommand: 'echo "Processing CSV: $csvPath"',
        },
        accounts: [
          {
            id: TEST_ACCOUNT_ID_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
          },
        ],
      },
      batches: [
        {
          id: TEST_BATCH_ID_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          importIds: [TEST_IMPORT_ID_1],
          accountIds: [TEST_ACCOUNT_ID_1],
          completedCount: 1,
        },
      ],
      imports: [
        {
          id: TEST_IMPORT_ID_1,
          accountId: TEST_ACCOUNT_ID_1,
          batchId: TEST_BATCH_ID_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          transactions: [
            {
              id: '30000000-0000-4000-8000-000000000001',
              originalTransaction: '',
              processedTransaction: JSON.stringify(mockTx.toJSON()),
              matchedRules: [],
              warnings: [],
            },
          ],
          transactionCount: 1,
          csvPath: '/tmp/test.csv',
          importedFrom: '2024-01-01',
          importedTo: '2024-01-31',
        },
      ],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    // Mock file operations
    vi.mocked(fileExists).mockResolvedValue(false)
    vi.mocked(mergeTransactionsIntoFile).mockResolvedValue('merged content')
    vi.mocked(createTempFile).mockResolvedValue('/tmp/temp-file')
    vi.mocked(commitTempFile).mockResolvedValue()
    vi.mocked(deleteBackup).mockResolvedValue()

    // Mock executePostProcessCommand to succeed
    vi.mocked(executePostProcessCommand).mockResolvedValue({
      success: true,
      output: 'CSV processed successfully',
    })

    const result = await confirmImport(TEST_BATCH_ID_1)

    expect(result.success).toBe(true)
    expect(result.csvPostProcessResults).toBeDefined()
    expect(Object.keys(result.csvPostProcessResults ?? {})).toHaveLength(1)
    expect(result.csvPostProcessResults?.[TEST_IMPORT_ID_1]).toMatchObject({
      importId: TEST_IMPORT_ID_1,
      success: true,
      output: 'CSV processed successfully',
    })

    // Verify mergeTransactionsIntoFile was called with correct delimiter format
    expect(mergeTransactionsIntoFile).toHaveBeenCalledWith(
      '/tmp/checking.beancount',
      expect.any(Array),
      expect.objectContaining({
        addBlankLines: true,
        delimiterComment: expect.stringMatching(/^\*\*\* .+\.csv$/),
      }),
    )

    // Verify basename was used (no directory path)
    const callArgs = vi.mocked(mergeTransactionsIntoFile).mock.calls[0]
    const delimiterComment = callArgs[2]?.delimiterComment
    expect(delimiterComment).toBeDefined()
    expect(delimiterComment).toContain('***')
    expect(delimiterComment).not.toContain('/tmp/')
    expect(delimiterComment).toMatch(/test\.csv/)
  })

  it('should deduplicate CSV paths in delimiter comment when multiple transactions from same file', async () => {
    const { confirmImport } = await import('../batches')
    const { createMockTransaction } = await import('@/test/test-utils')

    // Create multiple transactions from the same CSV file
    const mockTx1 = createMockTransaction({
      date: '2024-01-15',
      narration: 'Test 1',
    })
    const mockTx2 = createMockTransaction({
      date: '2024-01-16',
      narration: 'Test 2',
    })
    const mockTx3 = createMockTransaction({
      date: '2024-01-17',
      narration: 'Test 3',
    })

    const mockDb = createMockDb({
      config: {
        defaults: {
          beangulpCommand: 'echo test',
        },
        accounts: [
          {
            id: TEST_ACCOUNT_ID_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
          },
        ],
      },
      batches: [
        {
          id: TEST_BATCH_ID_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          importIds: [TEST_IMPORT_ID_1],
          accountIds: [TEST_ACCOUNT_ID_1],
          completedCount: 1,
        },
      ],
      imports: [
        {
          id: TEST_IMPORT_ID_1,
          accountId: TEST_ACCOUNT_ID_1,
          batchId: TEST_BATCH_ID_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          transactions: [
            {
              id: '30000000-0000-4000-8000-000000000001',
              originalTransaction: '',
              processedTransaction: JSON.stringify(mockTx1.toJSON()),
              matchedRules: [],
              warnings: [],
            },
            {
              id: '30000000-0000-4000-8000-000000000002',
              originalTransaction: '',
              processedTransaction: JSON.stringify(mockTx2.toJSON()),
              matchedRules: [],
              warnings: [],
            },
            {
              id: '30000000-0000-4000-8000-000000000003',
              originalTransaction: '',
              processedTransaction: JSON.stringify(mockTx3.toJSON()),
              matchedRules: [],
              warnings: [],
            },
          ],
          transactionCount: 3,
          csvPath: '/tmp/test.csv',
        },
      ],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    // Mock file operations
    vi.mocked(fileExists).mockResolvedValue(false)
    vi.mocked(mergeTransactionsIntoFile).mockResolvedValue('merged content')
    vi.mocked(createTempFile).mockResolvedValue('/tmp/temp-file')
    vi.mocked(commitTempFile).mockResolvedValue()
    vi.mocked(deleteBackup).mockResolvedValue()

    await confirmImport(TEST_BATCH_ID_1)

    // Verify delimiterComment contains the CSV filename only ONCE, not repeated
    const callArgs = vi.mocked(mergeTransactionsIntoFile).mock.calls[0]
    const delimiterComment = callArgs[2]?.delimiterComment
    expect(delimiterComment).toBeDefined()
    // The CSV path should appear exactly once, not three times
    expect(delimiterComment).toBe('*** test.csv')
  })

  it('should skip CSV post-processing when not configured', async () => {
    const { confirmImport } = await import('../batches')
    const { createMockTransaction } = await import('@/test/test-utils')

    const mockTx = createMockTransaction({
      date: '2024-01-15',
      narration: 'Test',
    })

    const mockDb = createMockDb({
      config: {
        defaults: {
          beangulpCommand: 'echo test',
          // No csvPostProcessCommand configured
        },
        accounts: [
          {
            id: TEST_ACCOUNT_ID_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
          },
        ],
      },
      batches: [
        {
          id: TEST_BATCH_ID_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          importIds: [TEST_IMPORT_ID_1],
          accountIds: [TEST_ACCOUNT_ID_1],
          completedCount: 1,
        },
      ],
      imports: [
        {
          id: TEST_IMPORT_ID_1,
          accountId: TEST_ACCOUNT_ID_1,
          batchId: TEST_BATCH_ID_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          transactions: [
            {
              id: '30000000-0000-4000-8000-000000000001',
              originalTransaction: '',
              processedTransaction: JSON.stringify(mockTx.toJSON()),
              matchedRules: [],
              warnings: [],
            },
          ],
          transactionCount: 1,
          csvPath: '/tmp/test.csv',
        },
      ],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    // Mock file operations
    vi.mocked(fileExists).mockResolvedValue(false)
    vi.mocked(mergeTransactionsIntoFile).mockResolvedValue('merged content')
    vi.mocked(createTempFile).mockResolvedValue('/tmp/temp-file')
    vi.mocked(commitTempFile).mockResolvedValue()
    vi.mocked(deleteBackup).mockResolvedValue()

    const result = await confirmImport(TEST_BATCH_ID_1)

    expect(result.success).toBe(true)
    expect(result.csvPostProcessResults).toEqual({})
  })

  it('should rollback on CSV post-processing failure', async () => {
    const { confirmImport } = await import('../batches')
    const { createMockTransaction } = await import('@/test/test-utils')

    const mockTx = createMockTransaction({
      date: '2024-01-15',
      narration: 'Test',
    })

    const mockDb = createMockDb({
      config: {
        defaults: {
          beangulpCommand: 'echo test',
          csvPostProcessCommand: 'exit 1',
        },
        accounts: [
          {
            id: TEST_ACCOUNT_ID_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
          },
        ],
      },
      batches: [
        {
          id: TEST_BATCH_ID_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          importIds: [TEST_IMPORT_ID_1],
          accountIds: [TEST_ACCOUNT_ID_1],
          completedCount: 1,
        },
      ],
      imports: [
        {
          id: TEST_IMPORT_ID_1,
          accountId: TEST_ACCOUNT_ID_1,
          batchId: TEST_BATCH_ID_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          transactions: [
            {
              id: '30000000-0000-4000-8000-000000000001',
              originalTransaction: '',
              processedTransaction: JSON.stringify(mockTx.toJSON()),
              matchedRules: [],
              warnings: [],
            },
          ],
          transactionCount: 1,
          csvPath: '/tmp/test.csv',
          importedFrom: '2024-01-01',
          importedTo: '2024-01-31',
        },
      ],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    // Mock file operations
    vi.mocked(fileExists).mockResolvedValue(false)
    vi.mocked(mergeTransactionsIntoFile).mockResolvedValue('merged content')
    vi.mocked(createTempFile).mockResolvedValue('/tmp/temp-file')
    vi.mocked(deleteTempFile).mockResolvedValue()
    vi.mocked(deleteBackup).mockResolvedValue()

    // Mock executePostProcessCommand to fail
    vi.mocked(executePostProcessCommand).mockResolvedValue({
      success: false,
      output: '',
      error: 'Command failed',
    })

    const result = await confirmImport(TEST_BATCH_ID_1)

    expect(result.success).toBe(false)
    expect(result.error).toContain('CSV post-process failed')

    // Verify cleanup was called
    expect(deleteTempFile).toHaveBeenCalled()
  })

  it('should pass all CSV variables to post-process command', async () => {
    const { confirmImport } = await import('../batches')
    const { createMockTransaction } = await import('@/test/test-utils')

    const mockTx = createMockTransaction({
      date: '2024-01-15',
      narration: 'Test',
    })

    const mockDb = createMockDb({
      config: {
        defaults: {
          beangulpCommand: 'echo test',
          csvPostProcessCommand:
            'echo "$csvPath $account $importedFrom $importedTo $outputFile"',
        },
        accounts: [
          {
            id: TEST_ACCOUNT_ID_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
          },
        ],
      },
      batches: [
        {
          id: TEST_BATCH_ID_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          importIds: [TEST_IMPORT_ID_1],
          accountIds: [TEST_ACCOUNT_ID_1],
          completedCount: 1,
        },
      ],
      imports: [
        {
          id: TEST_IMPORT_ID_1,
          accountId: TEST_ACCOUNT_ID_1,
          batchId: TEST_BATCH_ID_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          transactions: [
            {
              id: '30000000-0000-4000-8000-000000000001',
              originalTransaction: '',
              processedTransaction: JSON.stringify(mockTx.toJSON()),
              matchedRules: [],
              warnings: [],
            },
          ],
          transactionCount: 1,
          csvPath: '/tmp/test.csv',
          importedFrom: '2024-01-01',
          importedTo: '2024-01-31',
        },
      ],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    // Mock file operations
    vi.mocked(fileExists).mockResolvedValue(false)
    vi.mocked(mergeTransactionsIntoFile).mockResolvedValue('merged content')
    vi.mocked(createTempFile).mockResolvedValue('/tmp/temp-file')
    vi.mocked(commitTempFile).mockResolvedValue()
    vi.mocked(deleteBackup).mockResolvedValue()

    vi.mocked(executePostProcessCommand).mockResolvedValue({
      success: true,
      output: 'success',
    })

    await confirmImport(TEST_BATCH_ID_1)

    // Verify executePostProcessCommand was called with correct variables
    expect(executePostProcessCommand).toHaveBeenCalledWith(
      expect.any(String),
      '/tmp/test.csv',
      'checking',
      expect.objectContaining({
        csvPath: '/tmp/test.csv',
        account: 'checking',
        importedFrom: '2024-01-01',
        importedTo: '2024-01-31',
        outputFile: '/tmp/checking.beancount',
      }),
    )
  })
})
