import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  runImport,
  getImportResult,
  toggleSkippedRule,
  updateTransactionMeta,
  applyManualRuleToTransactions,
} from '../imports'
import { getDb } from '@/lib/db/db'
import { createMockDb, setupDbMock } from '@/test/mocks/db'
import {
  createMockGoCardless,
  setupGoCardlessMock,
} from '@/test/mocks/goCardless'
import { getGoCardless } from '@/lib/goCardless/goCardless'
import {
  createMockGoCardlessConfig,
  createMockTransaction,
  createMockRule,
  createNarrationSelector,
  TEST_IDS,
  readStream,
} from '@/test/test-utils'
import { deserializeNodesFromString } from 'beancount'
import { Temporal } from '@js-temporal/polyfill'
import path from 'path'

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
            id: TEST_IDS.ACCOUNT_1,
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

    const stream = await runImport('nonexistent-id')
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
            id: TEST_IDS.ACCOUNT_1,
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

    const stream = await runImport(TEST_IDS.ACCOUNT_1)
    const output = await readStream(stream)

    expect(output).toContain(
      'Error: Account "checking" has no goCardless connection',
    )
  })

  it('should return error stream when EUA has expired', async () => {
    const mockDb = createMockDb({
      config: {
        defaults: {
          beangulpCommand: 'echo "test"',
        },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
            goCardless: createMockGoCardlessConfig({
              endUserAgreementValidTill: Temporal.Instant.from(
                '2020-01-01T00:00:00Z',
              ),
            }),
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const stream = await runImport(TEST_IDS.ACCOUNT_1)
    const output = await readStream(stream)

    expect(output).toContain('expired')
    expect(output).toContain('reconnect')
  })

  it('should return error stream when GoCardless API call fails', async () => {
    const mockDb = createMockDb({
      config: {
        defaults: {
          beangulpCommand: 'echo "test"',
        },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
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

    const mockGoCardless = createMockGoCardless()
    mockGoCardless.getTransationsForAccounts.mockRejectedValue(
      new Error('API error: 401 Unauthorized'),
    )
    vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

    const stream = await runImport(TEST_IDS.ACCOUNT_1)
    const output = await readStream(stream)

    expect(output).toContain('API error: 401 Unauthorized')
  })

  it('should return error when no new transactions', async () => {
    const mockDb = createMockDb({
      config: {
        defaults: {
          beangulpCommand: 'echo "test"',
        },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
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

    const stream = await runImport(TEST_IDS.ACCOUNT_1)
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
            id: TEST_IDS.ACCOUNT_1,
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

    const stream = await runImport(TEST_IDS.ACCOUNT_1)
    const output = await readStream(stream)

    // Verify GoCardless was called
    expect(mockGoCardless.getTransationsForAccounts).toHaveBeenCalledWith(
      expect.any(Array), // accounts array
      Temporal.PlainDate.from('2024-11-01'), // importedTill
      expect.any(Temporal.PlainDate), // yesterday
      2, // decimalsRound
      false, // reversePayee
    )

    expect(output).toContain('Starting import for account: checking')
    expect(output).toContain('Import completed successfully')
    expect(output).toContain('__IMPORT_ID__')
  })

  it('should pass reversePayee: true from config to GoCardless', async () => {
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
            id: TEST_IDS.ACCOUNT_1,
            name: 'checking',
            csvFilename: 'export_$account.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
            goCardless: createMockGoCardlessConfig({
              importedTill: Temporal.PlainDate.from('2024-11-01'),
              reversePayee: true,
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

    await runImport(TEST_IDS.ACCOUNT_1)

    // Verify GoCardless was called with reversePayee: true
    expect(mockGoCardless.getTransationsForAccounts).toHaveBeenCalledWith(
      expect.any(Array), // accounts array
      Temporal.PlainDate.from('2024-11-01'), // importedTill
      expect.any(Temporal.PlainDate), // yesterday
      2, // decimalsRound
      true, // reversePayee - should be true from config
    )
  })

  it('should not update importedTill after successful import (only on confirm)', async () => {
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
            id: TEST_IDS.ACCOUNT_1,
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

    const stream = await runImport(TEST_IDS.ACCOUNT_1)
    await readStream(stream)

    // importedTill should NOT be updated after runImport - it's updated on confirmImport
    const account = mockDb.data.config.accounts[0]
    expect(account.goCardless!.importedTill.toString()).toBe(
      initialDate.toString(),
    )
  })

  it('should return error when account already has a pending import', async () => {
    const mockDb = createMockDb({
      config: {
        defaults: {
          beangulpCommand: 'echo "test"',
        },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
            name: 'checking',
            csvFilename: 'test.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
            goCardless: createMockGoCardlessConfig(),
          },
        ],
      },
      imports: [
        {
          id: TEST_IDS.IMPORT_1,
          accountId: TEST_IDS.ACCOUNT_1,
          timestamp: new Date().toISOString(),
          transactions: [],
          transactionCount: 0,
          csvPath: '/tmp/existing.csv',
        },
      ],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const stream = await runImport(TEST_IDS.ACCOUNT_1)
    const output = await readStream(stream)

    expect(output).toContain('already has a pending import')
    expect(output).toContain('Confirm or delete it first')
    expect(output).not.toContain('__IMPORT_ID__')
  })

  it('should handle beangulpCommand failure', async () => {
    const mockDb = createMockDb({
      config: {
        defaults: {
          beangulpCommand: 'exit 1',
        },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
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

    const stream = await runImport(TEST_IDS.ACCOUNT_1)
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
            id: TEST_IDS.ACCOUNT_1,
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

    const stream = await runImport(TEST_IDS.ACCOUNT_1)
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
            id: TEST_IDS.ACCOUNT_1,
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

    const stream = await runImport(TEST_IDS.ACCOUNT_1)
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
            id: TEST_IDS.ACCOUNT_1,
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

    const stream = await runImport(TEST_IDS.ACCOUNT_1)
    const output = await readStream(stream)

    // Should show the raw output
    expect(output).toContain('2024-01-15 * "Grocery Store" "Weekly shopping"')

    // Should show command failure
    expect(output).toContain('Import failed with exit code: 1')

    // Should NOT save ImportResult to database when command fails
    expect(mockDb.data.imports?.length ?? 0).toBe(0)

    // Should NOT include import ID marker for failed imports
    expect(output).not.toContain('__IMPORT_ID__')

    // No batch to verify in new architecture
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
            id: TEST_IDS.ACCOUNT_1,
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

    const stream = await runImport(TEST_IDS.ACCOUNT_1)
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
        accountId: TEST_IDS.ACCOUNT_1,
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
        expect(firstTx.processedNodes).toBeDefined()
        expect(firstTx.matchedRules).toBeInstanceOf(Array)
        expect(firstTx.warnings).toBeInstanceOf(Array)
      }
    }
  })

  it('should reject beancount with unsupported directives (open, balance, etc.)', async () => {
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
            id: TEST_IDS.ACCOUNT_1,
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

    const stream = await runImport(TEST_IDS.ACCOUNT_1)
    const output = await readStream(stream)

    // Should show the raw output
    expect(output).toContain('Starting import for account: checking')
    expect(output).toContain('Import completed successfully (exit code: 0)')

    // Should fail validation with error message about unsupported directives
    expect(output).toContain('Beancount parsing failed')
    expect(output).toContain('Unsupported directives found')
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
            id: TEST_IDS.ACCOUNT_1,
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
    const stream = await runImport(TEST_IDS.ACCOUNT_1)
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
      id: TEST_IDS.IMPORT_1,
      accountId: TEST_IDS.ACCOUNT_1,
      timestamp: '2024-01-15T10:00:00.000Z',
      transactions: [],
      transactionCount: 0,
      csvPath: '/tmp/test.csv',
    }

    const mockDb = createMockDb({
      imports: [mockImportResult],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await getImportResult(TEST_IDS.IMPORT_1)

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
        id: TEST_IDS.IMPORT_1,
        accountId: TEST_IDS.ACCOUNT_1,
        timestamp: '2024-01-15T10:00:00.000Z',
        transactions: [],
        transactionCount: 0,
        csvPath: '/tmp/test1.csv',
      },
      {
        id: TEST_IDS.IMPORT_2,
        accountId: TEST_IDS.ACCOUNT_2,
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

    const result = await getImportResult(TEST_IDS.IMPORT_2)

    expect(result).toEqual(mockImports[1])
  })
})

describe('toggleSkippedRule', () => {
  beforeEach(() => {
    setupDbMock()
  })

  it('should add rule to skippedRuleIds when not present', async () => {
    const mockTransaction = createMockTransaction({ narration: 'Test' })
    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
          },
        ],
      },
      imports: [
        {
          id: TEST_IDS.IMPORT_1,
          accountId: TEST_IDS.ACCOUNT_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          transactions: [
            {
              id: TEST_IDS.TRANSACTION_1,
              originalTransaction: JSON.stringify(mockTransaction.toJSON()),
              processedNodes: JSON.stringify([mockTransaction.toJSON()]),
              matchedRules: [],
              warnings: [],
              skippedRuleIds: [],
            },
          ],
          transactionCount: 1,
          csvPath: '/tmp/test.csv',
        },
      ],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await toggleSkippedRule(
      TEST_IDS.IMPORT_1,
      TEST_IDS.TRANSACTION_1,
      TEST_IDS.RULE_1,
    )

    expect(result.success).toBe(true)
    expect(result.isSkipped).toBe(true)

    // Verify the rule was added to skippedRuleIds
    const processedTx = mockDb.data.imports?.[0]?.transactions[0]
    expect(processedTx?.skippedRuleIds).toContain(TEST_IDS.RULE_1)
  })

  it('should remove rule from skippedRuleIds when present', async () => {
    const mockTransaction = createMockTransaction({ narration: 'Test' })
    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
          },
        ],
      },
      imports: [
        {
          id: TEST_IDS.IMPORT_1,
          accountId: TEST_IDS.ACCOUNT_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          transactions: [
            {
              id: TEST_IDS.TRANSACTION_1,
              originalTransaction: JSON.stringify(mockTransaction.toJSON()),
              processedNodes: JSON.stringify([mockTransaction.toJSON()]),
              matchedRules: [],
              warnings: [],
              skippedRuleIds: [TEST_IDS.RULE_1], // Already skipped
            },
          ],
          transactionCount: 1,
          csvPath: '/tmp/test.csv',
        },
      ],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await toggleSkippedRule(
      TEST_IDS.IMPORT_1,
      TEST_IDS.TRANSACTION_1,
      TEST_IDS.RULE_1,
    )

    expect(result.success).toBe(true)
    expect(result.isSkipped).toBe(false)

    // Verify the rule was removed from skippedRuleIds
    const processedTx = mockDb.data.imports?.[0]?.transactions[0]
    expect(processedTx?.skippedRuleIds).not.toContain(TEST_IDS.RULE_1)
    expect(processedTx?.skippedRuleIds).toHaveLength(0)
  })

  it('should re-run rules after toggling (skip rule removes its effect)', async () => {
    const mockTransaction = createMockTransaction({ narration: 'Test' })
    const mockRule = createMockRule({
      id: TEST_IDS.RULE_1,
      selector: createNarrationSelector('Test', 'substring'),
      actions: [
        {
          type: 'modify_narration',
          operation: 'append',
          value: ' - processed',
        },
      ],
    })

    // Create a processed transaction where the rule was applied
    const processedTransaction = createMockTransaction({
      narration: 'Test - processed',
    })

    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [mockRule],
            variables: [],
          },
        ],
      },
      imports: [
        {
          id: TEST_IDS.IMPORT_1,
          accountId: TEST_IDS.ACCOUNT_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          transactions: [
            {
              id: TEST_IDS.TRANSACTION_1,
              originalTransaction: JSON.stringify(mockTransaction.toJSON()),
              processedNodes: JSON.stringify([processedTransaction.toJSON()]),
              matchedRules: [
                {
                  ruleId: TEST_IDS.RULE_1,
                  ruleName: mockRule.name,
                  actionsApplied: ['modify_narration'],
                  applicationType: 'automatic' as const,
                },
              ],
              warnings: [],
              skippedRuleIds: [],
            },
          ],
          transactionCount: 1,
          csvPath: '/tmp/test.csv',
        },
      ],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    // Skip the rule
    const result = await toggleSkippedRule(
      TEST_IDS.IMPORT_1,
      TEST_IDS.TRANSACTION_1,
      TEST_IDS.RULE_1,
    )

    expect(result.success).toBe(true)
    expect(result.isSkipped).toBe(true)

    // Verify the rule effect was removed after re-running
    const processedTx = mockDb.data.imports?.[0]?.transactions[0]
    const nodes = JSON.parse(processedTx?.processedNodes ?? '[]')
    expect(nodes[0]?.narration).toBe('Test') // Original narration, not processed
    expect(processedTx?.matchedRules).toHaveLength(0)
  })

  it('should return error when import not found', async () => {
    const mockDb = createMockDb({
      imports: [],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await toggleSkippedRule(
      'nonexistent-import',
      TEST_IDS.TRANSACTION_1,
      TEST_IDS.RULE_1,
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Import not found')
  })

  it('should return error when transaction not found', async () => {
    const mockDb = createMockDb({
      imports: [
        {
          id: TEST_IDS.IMPORT_1,
          accountId: TEST_IDS.ACCOUNT_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          transactions: [], // No transactions
          transactionCount: 0,
          csvPath: '/tmp/test.csv',
        },
      ],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await toggleSkippedRule(
      TEST_IDS.IMPORT_1,
      'nonexistent-transaction',
      TEST_IDS.RULE_1,
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Transaction not found')
  })
})

describe('updateTransactionMeta', () => {
  beforeEach(() => {
    setupDbMock()
  })

  it('should add string metadata to a transaction', async () => {
    const mockTransaction = createMockTransaction({ narration: 'Test' })
    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
          },
        ],
      },
      imports: [
        {
          id: TEST_IDS.IMPORT_1,
          accountId: TEST_IDS.ACCOUNT_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          transactions: [
            {
              id: TEST_IDS.TRANSACTION_1,
              originalTransaction: JSON.stringify(mockTransaction.toJSON()),
              processedNodes: JSON.stringify([mockTransaction.toJSON()]),
              matchedRules: [],
              warnings: [],
              skippedRuleIds: [],
            },
          ],
          transactionCount: 1,
          csvPath: '/tmp/test.csv',
        },
      ],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await updateTransactionMeta(
      TEST_IDS.IMPORT_1,
      TEST_IDS.TRANSACTION_1,
      'note',
      'This is a test note',
    )

    expect(result.success).toBe(true)

    // Verify the metadata was added
    const processedTx = mockDb.data.imports?.[0]?.transactions[0]
    const nodes = deserializeNodesFromString(
      processedTx?.processedNodes ?? '[]',
    )
    expect(nodes[0].type).toBe('transaction')
    expect(
      (nodes[0] as { metadata?: Record<string, unknown> }).metadata,
    ).toHaveProperty('note')
    expect(
      (
        (nodes[0] as { metadata?: Record<string, { value: unknown }> }).metadata
          ?.note as { value: unknown }
      )?.value,
    ).toBe('This is a test note')
  })

  it('should add number metadata to a transaction', async () => {
    const mockTransaction = createMockTransaction({ narration: 'Test' })
    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
          },
        ],
      },
      imports: [
        {
          id: TEST_IDS.IMPORT_1,
          accountId: TEST_IDS.ACCOUNT_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          transactions: [
            {
              id: TEST_IDS.TRANSACTION_1,
              originalTransaction: JSON.stringify(mockTransaction.toJSON()),
              processedNodes: JSON.stringify([mockTransaction.toJSON()]),
              matchedRules: [],
              warnings: [],
              skippedRuleIds: [],
            },
          ],
          transactionCount: 1,
          csvPath: '/tmp/test.csv',
        },
      ],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await updateTransactionMeta(
      TEST_IDS.IMPORT_1,
      TEST_IDS.TRANSACTION_1,
      'priority',
      42,
    )

    expect(result.success).toBe(true)

    // Verify the metadata was added
    // Note: Number values get serialized to strings by the beancount library
    const processedTx = mockDb.data.imports?.[0]?.transactions[0]
    const nodes = deserializeNodesFromString(
      processedTx?.processedNodes ?? '[]',
    )
    expect(
      (
        (nodes[0] as { metadata?: Record<string, { value: unknown }> }).metadata
          ?.priority as { value: unknown }
      )?.value,
    ).toBe('42')
  })

  it('should add boolean metadata to a transaction', async () => {
    const mockTransaction = createMockTransaction({ narration: 'Test' })
    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
          },
        ],
      },
      imports: [
        {
          id: TEST_IDS.IMPORT_1,
          accountId: TEST_IDS.ACCOUNT_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          transactions: [
            {
              id: TEST_IDS.TRANSACTION_1,
              originalTransaction: JSON.stringify(mockTransaction.toJSON()),
              processedNodes: JSON.stringify([mockTransaction.toJSON()]),
              matchedRules: [],
              warnings: [],
              skippedRuleIds: [],
            },
          ],
          transactionCount: 1,
          csvPath: '/tmp/test.csv',
        },
      ],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await updateTransactionMeta(
      TEST_IDS.IMPORT_1,
      TEST_IDS.TRANSACTION_1,
      'reviewed',
      true,
    )

    expect(result.success).toBe(true)

    // Verify the metadata was added
    const processedTx = mockDb.data.imports?.[0]?.transactions[0]
    const nodes = deserializeNodesFromString(
      processedTx?.processedNodes ?? '[]',
    )
    expect(
      (
        (nodes[0] as { metadata?: Record<string, { value: unknown }> }).metadata
          ?.reviewed as { value: unknown }
      )?.value,
    ).toBe(true)
  })

  it('should remove metadata with null value', async () => {
    const mockTransaction = createMockTransaction({ narration: 'Test' })
    // Add initial metadata to the transaction
    const txJson = mockTransaction.toJSON()
    txJson.metadata = { note: { type: 'string', value: 'existing note' } }

    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
          },
        ],
      },
      imports: [
        {
          id: TEST_IDS.IMPORT_1,
          accountId: TEST_IDS.ACCOUNT_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          transactions: [
            {
              id: TEST_IDS.TRANSACTION_1,
              originalTransaction: JSON.stringify(mockTransaction.toJSON()),
              processedNodes: JSON.stringify([txJson]),
              matchedRules: [],
              warnings: [],
              skippedRuleIds: [],
            },
          ],
          transactionCount: 1,
          csvPath: '/tmp/test.csv',
        },
      ],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await updateTransactionMeta(
      TEST_IDS.IMPORT_1,
      TEST_IDS.TRANSACTION_1,
      'note',
      null,
    )

    expect(result.success).toBe(true)

    // Verify the metadata was removed
    const processedTx = mockDb.data.imports?.[0]?.transactions[0]
    const nodes = deserializeNodesFromString(
      processedTx?.processedNodes ?? '[]',
    )
    expect(
      (nodes[0] as { metadata?: Record<string, unknown> }).metadata,
    ).not.toHaveProperty('note')
  })

  it('should store note in originalTransaction and persist across rule re-executions', async () => {
    const mockTransaction = createMockTransaction({ narration: 'Test' })

    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [],
            variables: [],
          },
        ],
      },
      imports: [
        {
          id: TEST_IDS.IMPORT_1,
          accountId: TEST_IDS.ACCOUNT_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          transactions: [
            {
              id: TEST_IDS.TRANSACTION_1,
              originalTransaction: JSON.stringify(mockTransaction.toJSON()),
              processedNodes: JSON.stringify([mockTransaction.toJSON()]),
              matchedRules: [],
              warnings: [],
              skippedRuleIds: [],
            },
          ],
          transactionCount: 1,
          csvPath: '/tmp/test.csv',
        },
      ],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await updateTransactionMeta(
      TEST_IDS.IMPORT_1,
      TEST_IDS.TRANSACTION_1,
      'note',
      'This note should persist',
    )

    expect(result.success).toBe(true)

    // Verify the note is stored in originalTransaction
    const processedTx = mockDb.data.imports?.[0]?.transactions[0]
    const originalTxJson = JSON.parse(processedTx?.originalTransaction ?? '{}')
    expect(originalTxJson.metadata?.note?.value).toBe(
      'This note should persist',
    )

    // Verify the note also appears in processedNodes after rule re-execution
    const nodes = deserializeNodesFromString(
      processedTx?.processedNodes ?? '[]',
    )
    expect(nodes[0].type).toBe('transaction')
    expect(
      (
        (nodes[0] as { metadata?: Record<string, { value: unknown }> }).metadata
          ?.note as { value: unknown }
      )?.value,
    ).toBe('This note should persist')
  })

  it('should return error when import not found', async () => {
    const mockDb = createMockDb({
      imports: [],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await updateTransactionMeta(
      'nonexistent-import',
      TEST_IDS.TRANSACTION_1,
      'note',
      'test',
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Import not found')
  })

  it('should return error when transaction not found', async () => {
    const mockDb = createMockDb({
      imports: [
        {
          id: TEST_IDS.IMPORT_1,
          accountId: TEST_IDS.ACCOUNT_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          transactions: [], // No transactions
          transactionCount: 0,
          csvPath: '/tmp/test.csv',
        },
      ],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await updateTransactionMeta(
      TEST_IDS.IMPORT_1,
      'nonexistent-transaction',
      'note',
      'test',
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Transaction not found')
  })

  it('should preserve manually applied rules when adding metadata', async () => {
    const mockTransaction = createMockTransaction({ narration: 'Test' })

    // Create a manual rule that modifies the payee
    const manualRule = createMockRule({
      id: TEST_IDS.RULE_2,
      name: 'Manual Payee Rule',
      selector: createNarrationSelector('Test', 'substring'),
      allowManualSelection: true,
      actions: [
        {
          type: 'modify_payee',
          operation: 'replace',
          value: 'Manual Payee',
        },
      ],
    })

    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
            name: 'checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: '/tmp/checking.beancount',
            rules: [manualRule],
            variables: [],
          },
        ],
      },
      imports: [
        {
          id: TEST_IDS.IMPORT_1,
          accountId: TEST_IDS.ACCOUNT_1,
          timestamp: '2024-01-15T10:00:00.000Z',
          transactions: [
            {
              id: TEST_IDS.TRANSACTION_1,
              originalTransaction: JSON.stringify(mockTransaction.toJSON()),
              processedNodes: JSON.stringify([mockTransaction.toJSON()]),
              matchedRules: [],
              warnings: [],
              skippedRuleIds: [],
            },
          ],
          transactionCount: 1,
          csvPath: '/tmp/test.csv',
        },
      ],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    // Apply the manual rule
    const applyResult = await applyManualRuleToTransactions(
      TEST_IDS.IMPORT_1,
      [TEST_IDS.TRANSACTION_1],
      TEST_IDS.RULE_2,
    )
    expect(applyResult.success).toBe(true)

    // Verify the manual rule was applied
    let processedTx = mockDb.data.imports?.[0]?.transactions[0]
    expect(processedTx?.matchedRules).toHaveLength(1)
    expect(processedTx?.matchedRules[0]).toMatchObject({
      ruleId: TEST_IDS.RULE_2,
      ruleName: 'Manual Payee Rule',
      applicationType: 'manual',
    })

    // Add a note to the transaction
    const metaResult = await updateTransactionMeta(
      TEST_IDS.IMPORT_1,
      TEST_IDS.TRANSACTION_1,
      'note',
      'This is a test note',
    )
    expect(metaResult.success).toBe(true)

    // BUG: The manual rule application type should be preserved as 'manual',
    // but updateTransactionMeta re-runs rules and changes it to 'automatic'
    processedTx = mockDb.data.imports?.[0]?.transactions[0]
    expect(processedTx?.matchedRules).toHaveLength(1)
    expect(processedTx?.matchedRules[0]).toMatchObject({
      ruleId: TEST_IDS.RULE_2,
      ruleName: 'Manual Payee Rule',
      applicationType: 'manual', // This will FAIL - gets changed to 'automatic'
    })

    // Verify note was added
    const nodes = deserializeNodesFromString(
      processedTx?.processedNodes ?? '[]',
    )
    expect(
      (
        (nodes[0] as { metadata?: Record<string, { value: unknown }> }).metadata
          ?.note as { value: unknown }
      )?.value,
    ).toBe('This is a test note')
  })
})
