import { describe, it, expect, beforeEach, vi } from 'vitest'
import { runImport, getImportResult } from '../imports'
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

describe('runImport', () => {
  beforeEach(() => {
    setupDbMock()
    setupGoCardlessMock()
  })

  it('should return error stream when account not found', async () => {
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
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const stream = await runImport('nonexistent-id', TEST_BATCH_ID_1)
    const output = await readStream(stream)

    expect(output).toContain(
      'Error: Account with ID "nonexistent-id" not found',
    )
  })

  it('should return error stream when goCardless is not configured', async () => {
    const mockDb = createMockDb({
      config: {
        defaults: {
          beangulpCommand: 'echo "test"',
        },
        accounts: [
          {
            id: TEST_ACCOUNT_ID_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
            // No goCardless property
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const stream = await runImport(TEST_ACCOUNT_ID_1, TEST_BATCH_ID_1)
    const output = await readStream(stream)

    expect(output).toContain(
      'Error: Account "checking" has no goCardless connection',
    )
  })

  it('should return error when no new transactions', async () => {
    const mockDb = createMockDb({
      config: {
        defaults: {
          beangulpCommand: 'echo "test"',
        },
        accounts: [
          {
            id: TEST_ACCOUNT_ID_1,
            name: 'checking',
            csvFilename: 'test.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
            goCardless: createMockGoCardlessConfig(),
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    // Mock GoCardless to return empty transactions
    const mockGoCardless = createMockGoCardless()
    mockGoCardless.getTransationsForAccounts.mockResolvedValue([])
    vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

    const stream = await runImport(TEST_ACCOUNT_ID_1, TEST_BATCH_ID_1)
    const output = await readStream(stream)

    expect(output).toContain('Error: No new transactions')
  })

  it('should fetch transactions from GoCardless and process with beangulpCommand', async () => {
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
            csvFilename: 'export_$account.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
            goCardless: createMockGoCardlessConfig({
              importedTill: Temporal.PlainDate.from('2024-11-01'),
            }),
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    // Mock GoCardless with sample transactions
    const mockGoCardless = createMockGoCardless()
    mockGoCardless.getTransationsForAccounts.mockResolvedValue([
      {
        transactionId: 'tx1',
        bookingDate: Temporal.PlainDate.from('2024-11-15'),
        valueDate: Temporal.PlainDate.from('2024-11-15'),
        transactionAmount: { amount: '-10.00', currency: 'USD' },
        creditorName: 'Test Merchant',
        remittanceInformationUnstructured: 'Test transaction',
      },
    ])
    vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

    const stream = await runImport(TEST_ACCOUNT_ID_1, TEST_BATCH_ID_1)
    const output = await readStream(stream)

    // Verify GoCardless was called
    expect(mockGoCardless.getTransationsForAccounts).toHaveBeenCalledWith(
      expect.any(Array), // accounts array
      Temporal.PlainDate.from('2024-11-01'), // importedTill
      expect.any(Temporal.PlainDate), // yesterday
      2, // decimalsRound
    )

    expect(output).toContain('Starting import for account: checking')
    expect(output).toContain('Import completed successfully')
    expect(output).toContain('__IMPORT_ID__')
  })

  it('should update importedTill after successful import', async () => {
    const initialDate = Temporal.PlainDate.from('2024-11-01')
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
            csvFilename: 'test.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
            goCardless: createMockGoCardlessConfig({
              importedTill: initialDate,
            }),
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    // Mock GoCardless with valid data
    const mockGoCardless = createMockGoCardless()
    mockGoCardless.getTransationsForAccounts.mockResolvedValue([
      {
        transactionId: 'tx1',
        bookingDate: Temporal.PlainDate.from('2024-11-15'),
        valueDate: Temporal.PlainDate.from('2024-11-15'),
        transactionAmount: { amount: '-10.00', currency: 'USD' },
        creditorName: 'Test Merchant',
        remittanceInformationUnstructured: 'Test transaction',
      },
    ])
    vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

    const stream = await runImport(TEST_ACCOUNT_ID_1, TEST_BATCH_ID_1)
    await readStream(stream)

    // Check that importedTill was updated
    const account = mockDb.data.config.accounts[0]
    expect(account.goCardless!.importedTill).not.toEqual(initialDate)
    // Should be updated to yesterday
    const yesterday = Temporal.Now.zonedDateTimeISO()
      .subtract({ days: 1 })
      .toPlainDate()
    expect(account.goCardless!.importedTill.toString()).toBe(
      yesterday.toString(),
    )
  })

  it('should handle beangulpCommand failure', async () => {
    const mockDb = createMockDb({
      config: {
        defaults: {
          beangulpCommand: 'exit 1',
        },
        accounts: [
          {
            id: TEST_ACCOUNT_ID_1,
            name: 'checking',
            csvFilename: 'test.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
            goCardless: createMockGoCardlessConfig(),
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    // Mock GoCardless with sample transactions
    const mockGoCardless = createMockGoCardless()
    mockGoCardless.getTransationsForAccounts.mockResolvedValue([
      {
        transactionId: 'tx1',
        bookingDate: Temporal.PlainDate.from('2024-11-15'),
        valueDate: Temporal.PlainDate.from('2024-11-15'),
        transactionAmount: { amount: '-10.00', currency: 'USD' },
        creditorName: 'Test Merchant',
        remittanceInformationUnstructured: 'Test transaction',
      },
    ])
    vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

    const stream = await runImport(TEST_ACCOUNT_ID_1, TEST_BATCH_ID_1)
    const output = await readStream(stream)

    expect(output).toContain('Import failed with exit code: 1')
    expect(output).not.toContain('__IMPORT_ID__')
  })
})

describe('runImport with beancount parsing', () => {
  beforeEach(() => {
    setupDbMock()
    setupGoCardlessMock()
  })

  it('should fail import when beancount parsing encounters errors', async () => {
    const fixturePathInvalid = path.join(
      __dirname,
      '../../../test/fixtures/invalid-beancount.txt',
    )
    const mockDb = createMockDb({
      config: {
        defaults: {
          beangulpCommand: `cat ${fixturePathInvalid}`,
        },
        accounts: [
          {
            id: TEST_ACCOUNT_ID_1,
            name: 'savings',
            defaultOutputFile: '/tmp/savings.beancount',
            csvFilename: 'csv.csv',
            rules: [],
            variables: [],
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

    const stream = await runImport(TEST_ACCOUNT_ID_1, TEST_BATCH_ID_1)
    const output = await readStream(stream)

    // Should contain raw output
    expect(output).toContain('Starting import for account: savings')

    // Should fail with parse error
    expect(output).toContain('Beancount parsing failed')
    expect(output).not.toContain('__IMPORT_ID__')
  })

  it('should handle empty beancount output', async () => {
    const mockDb = createMockDb({
      config: {
        defaults: {
          beangulpCommand: 'echo ""',
        },
        accounts: [
          {
            id: TEST_ACCOUNT_ID_1,
            name: 'empty',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/empty.beancount',
            rules: [],
            variables: [],
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

    const stream = await runImport(TEST_ACCOUNT_ID_1, TEST_BATCH_ID_1)
    const output = await readStream(stream)

    expect(output).toContain('Starting import for account: empty')
    expect(output).toContain('Import completed successfully (exit code: 0)')

    // Empty beancount should parse successfully and generate an import ID
    expect(output).toContain('__IMPORT_ID__')

    // Extract import ID and verify it was saved to database
    const importIdMatch = output.match(/__IMPORT_ID__\n([^\n]+)\n/)
    expect(importIdMatch).toBeTruthy()

    if (importIdMatch) {
      const importId = importIdMatch[1]
      const savedImport = mockDb.data.imports?.find(
        (imp) => imp.id === importId,
      )
      expect(savedImport).toBeDefined()

      // Verify the saved import has transactions array
      expect(savedImport!.transactions).toBeInstanceOf(Array)
      expect(savedImport!.transactionCount).toBe(0)
    }
  })

  it('should not include beancount result when command fails', async () => {
    const fixturePathValid = path.join(
      __dirname,
      '../../../test/fixtures/valid-beancount.txt',
    )
    const mockDb = createMockDb({
      config: {
        defaults: {
          beangulpCommand: `cat ${fixturePathValid} && exit 1`,
        },
        accounts: [
          {
            id: TEST_ACCOUNT_ID_1,
            name: 'fail',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/fail.beancount',
            rules: [],
            variables: [],
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

    const stream = await runImport(TEST_ACCOUNT_ID_1, TEST_BATCH_ID_1)
    const output = await readStream(stream)

    // Should show the raw output
    expect(output).toContain('2024-01-15 * "Grocery Store" "Weekly shopping"')

    // Should show command failure
    expect(output).toContain('Import failed with exit code: 1')

    // Should NOT save ImportResult to database when command fails
    expect(mockDb.data.imports?.length ?? 0).toBe(0)

    // Should NOT include import ID marker for failed imports
    expect(output).not.toContain('__IMPORT_ID__')

    // Batch should not exist but have empty importIds array
    const batch = mockDb.data.batches?.find((b) => b.id === TEST_BATCH_ID_1)
    expect(batch).not.toBeDefined()
  })

  it('should save import result to database and return import ID', async () => {
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
            variables: [],
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

    const stream = await runImport(TEST_ACCOUNT_ID_1, TEST_BATCH_ID_1)
    const output = await readStream(stream)

    // Should contain import ID
    expect(output).toContain('__IMPORT_ID__')

    // Extract import ID
    const importIdMatch = output.match(/__IMPORT_ID__\n([^\n]+)\n/)
    expect(importIdMatch).toBeTruthy()

    if (importIdMatch) {
      const importId = importIdMatch[1]

      // Verify it was saved to database
      expect(mockDb.data.imports).toBeDefined()
      expect(mockDb.data.imports?.length).toBe(1)

      const savedImport = mockDb.data.imports?.[0]
      expect(savedImport).toMatchObject({
        id: importId,
        accountId: TEST_ACCOUNT_ID_1,
      })
      expect(savedImport?.timestamp).toBeDefined()
      expect(savedImport?.transactions).toBeDefined()
      expect(savedImport?.transactions).toBeInstanceOf(Array)

      // Verify transactionCount is calculated correctly
      expect(savedImport?.transactionCount).toBe(
        savedImport?.transactions.length,
      )
      expect(savedImport?.transactionCount).toBeGreaterThan(0)

      // Verify each transaction has the required structure
      if (savedImport && savedImport.transactions.length > 0) {
        const firstTx = savedImport.transactions[0]
        expect(firstTx.id).toBeDefined()
        expect(firstTx.originalTransaction).toBeDefined()
        expect(firstTx.processedEntries).toBeDefined()
        expect(firstTx.matchedRules).toBeInstanceOf(Array)
        expect(firstTx.warnings).toBeInstanceOf(Array)
      }
    }
  })

  it('should reject beancount with unsupported entry types (open, balance, etc.)', async () => {
    const fixturePathUnsupported = path.join(
      __dirname,
      '../../../test/fixtures/unsupported-beancount.txt',
    )
    const mockDb = createMockDb({
      config: {
        defaults: {
          beangulpCommand: `cat ${fixturePathUnsupported}`,
        },
        accounts: [
          {
            id: TEST_ACCOUNT_ID_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
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

    const stream = await runImport(TEST_ACCOUNT_ID_1, TEST_BATCH_ID_1)
    const output = await readStream(stream)

    // Should show the raw output
    expect(output).toContain('Starting import for account: checking')
    expect(output).toContain('Import completed successfully (exit code: 0)')

    // Should fail validation with error message about unsupported entry types
    expect(output).toContain('Beancount parsing failed')
    expect(output).toContain('Unsupported entry types found')
    expect(output).toContain('open')
    expect(output).toContain('balance')

    // Should NOT return import ID
    expect(output).not.toContain('__IMPORT_ID__')

    // Verify nothing was saved to database
    expect(mockDb.data.imports?.length ?? 0).toBe(0)
  })
})

describe('runImport stream robustness', () => {
  beforeEach(() => {
    setupDbMock()
    setupGoCardlessMock()
  })

  it('should handle concurrent stdout/stderr output without controller errors', async () => {
    // This test verifies the fix for the "Controller is already closed" race condition.
    // The bug occurred when stdout/stderr events fired after the controller was closed.
    // By outputting to both streams rapidly, we increase the chance of triggering the race.
    const fixturePathValid = path.join(
      __dirname,
      '../../../test/fixtures/valid-beancount.txt',
    )
    const mockDb = createMockDb({
      config: {
        defaults: {
          // Command that outputs to both stdout and stderr in rapid succession,
          // then outputs valid beancount data
          beangulpCommand: `bash -c 'echo "stderr warning 1" >&2; echo "stderr warning 2" >&2' && cat ${fixturePathValid}`,
        },
        accounts: [
          {
            id: TEST_ACCOUNT_ID_1,
            name: 'checking',
            csvFilename: 'test.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
            goCardless: createMockGoCardlessConfig(),
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    // Mock GoCardless with sample transactions
    const mockGoCardless = createMockGoCardless()
    mockGoCardless.getTransationsForAccounts.mockResolvedValue([
      {
        transactionId: 'tx1',
        bookingDate: Temporal.PlainDate.from('2024-11-15'),
        valueDate: Temporal.PlainDate.from('2024-11-15'),
        transactionAmount: { amount: '-10.00', currency: 'USD' },
        creditorName: 'Test Merchant',
        remittanceInformationUnstructured: 'Test transaction',
      },
    ])
    vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

    // The key assertion: the stream should complete without throwing
    // Prior to the fix, this would throw "Controller is already closed"
    const stream = await runImport(TEST_ACCOUNT_ID_1, TEST_BATCH_ID_1)
    const output = await readStream(stream)

    // Verify stderr content was captured (prefixed with [stderr])
    expect(output).toContain('[stderr]')
    expect(output).toContain('stderr warning')

    // Verify the import completed successfully despite concurrent output
    expect(output).toContain('Import completed successfully')
    expect(output).toContain('__IMPORT_ID__')
  })
})

describe('getImportResult', () => {
  beforeEach(() => {
    setupDbMock()
  })

  it('should return import result by ID', async () => {
    const mockImportResult = {
      id: TEST_IMPORT_ID_1,
      accountId: TEST_ACCOUNT_ID_1,
      batchId: TEST_BATCH_ID_1,
      timestamp: '2024-01-15T10:00:00.000Z',
      transactions: [],
      transactionCount: 0,
      csvPath: '/tmp/test.csv',
    }

    const mockDb = createMockDb({
      imports: [mockImportResult],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await getImportResult(TEST_IMPORT_ID_1)

    expect(result).toEqual(mockImportResult)
  })

  it('should return null when import ID not found', async () => {
    const mockDb = createMockDb({
      imports: [],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await getImportResult('nonexistent-id')

    expect(result).toBeNull()
  })

  it('should handle multiple imports and return the correct one', async () => {
    const mockImports = [
      {
        id: TEST_IMPORT_ID_1,
        accountId: TEST_ACCOUNT_ID_1,
        batchId: TEST_BATCH_ID_1,
        timestamp: '2024-01-15T10:00:00.000Z',
        transactions: [],
        transactionCount: 0,
        csvPath: '/tmp/test1.csv',
      },
      {
        id: TEST_IMPORT_ID_2,
        accountId: TEST_ACCOUNT_ID_2,
        batchId: TEST_BATCH_ID_1,
        timestamp: '2024-01-15T11:00:00.000Z',
        transactions: [],
        transactionCount: 0,
        csvPath: '/tmp/test2.csv',
      },
    ]

    const mockDb = createMockDb({
      imports: mockImports,
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await getImportResult(TEST_IMPORT_ID_2)

    expect(result).toEqual(mockImports[1])
  })
})
