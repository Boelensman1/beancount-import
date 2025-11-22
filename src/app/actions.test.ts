import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getAccounts,
  runImport,
  getImportResult,
  createBatch,
  getBatchResult,
} from './actions'
import { getDb } from '@/lib/db/db'
import { createMockDb, setupDbMock } from '@/test/mocks/db'
import path from 'path'

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

describe('getAccounts', () => {
  beforeEach(() => {
    setupDbMock()
  })

  it('should return accounts from database', async () => {
    // Setup mock database with test accounts
    const mockDb = createMockDb({
      config: {
        accounts: [
          {
            id: 'account-id-1',
            name: 'checking',
            importerCommand: 'echo test1',
            rules: [],
          },
          {
            id: 'account-id-2',
            name: 'savings',
            importerCommand: 'echo test2',
            rules: [],
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const accounts = await getAccounts()

    expect(accounts).toEqual([
      {
        id: 'account-id-1',
        name: 'checking',
        importerCommand: 'echo test1',
        rules: [],
      },
      {
        id: 'account-id-2',
        name: 'savings',
        importerCommand: 'echo test2',
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

describe('createBatch', () => {
  beforeEach(() => {
    setupDbMock()
  })

  it('should create a batch with given account IDs', async () => {
    const mockDb = createMockDb()
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const accountIds = ['account-id-1', 'account-id-2']
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

    const accountIds = ['account-id-1']
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
      id: 'batch-id-1',
      timestamp: '2024-01-15T10:00:00.000Z',
      importIds: ['import-id-1', 'import-id-2'],
      accountIds: ['account-id-1', 'account-id-2'],
    }

    const mockImports = [
      {
        id: 'import-id-1',
        accountId: 'account-id-1',
        batchId: 'batch-id-1',
        timestamp: '2024-01-15T10:00:00.000Z',
        transactions: [],
        transactionCount: 5,
      },
      {
        id: 'import-id-2',
        accountId: 'account-id-2',
        batchId: 'batch-id-1',
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

    const result = await getBatchResult('batch-id-1')

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
      id: 'batch-id-1',
      timestamp: '2024-01-15T10:00:00.000Z',
      importIds: [],
      accountIds: ['account-id-1'],
    }

    const mockDb = createMockDb({
      batches: [mockBatch],
      imports: [],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await getBatchResult('batch-id-1')

    expect(result).toBeDefined()
    expect(result?.batch).toEqual(mockBatch)
    expect(result?.imports).toEqual([])
  })
})

describe('runImport', () => {
  beforeEach(() => {
    setupDbMock()
  })

  it('should return error stream when account not found', async () => {
    const mockDb = createMockDb({
      config: {
        accounts: [
          {
            id: 'account-id-1',
            name: 'checking',
            importerCommand: 'echo test',
            rules: [],
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const stream = await runImport('nonexistent-id', 'batch-id-1')
    const output = await readStream(stream)

    expect(output).toContain(
      'Error: Account with ID "nonexistent-id" not found',
    )
  })

  it('should return error stream when importerCommand is missing', async () => {
    const mockDb = createMockDb({
      config: {
        accounts: [
          {
            id: 'account-id-1',
            name: 'checking',
            importerCommand: '',
            rules: [],
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const stream = await runImport('account-id-1', 'batch-id-1')
    const output = await readStream(stream)

    expect(output).toContain(
      'Error: Account "checking" has no importer command configured',
    )
  })

  it('should execute simple echo command and stream output', async () => {
    const mockDb = createMockDb({
      config: {
        accounts: [
          {
            id: 'account-id-1',
            name: 'checking',
            importerCommand: 'echo hello',
            rules: [],
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const stream = await runImport('account-id-1', 'batch-id-1')
    const output = await readStream(stream)

    expect(output).toContain('Starting import for account: checking')
    expect(output).toContain('Command: echo hello')
    expect(output).toContain('hello')
    expect(output).toContain('Import completed successfully (exit code: 0)')
  })

  it('should handle command with multiple words', async () => {
    const mockDb = createMockDb({
      config: {
        accounts: [
          {
            id: 'account-id-1',
            name: 'checking',
            importerCommand: 'echo hello world',
            rules: [],
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const stream = await runImport('account-id-1', 'batch-id-1')
    const output = await readStream(stream)

    expect(output).toContain('hello world')
    expect(output).toContain('Import completed successfully (exit code: 0)')
  })

  it('should handle command with quoted arguments', async () => {
    const mockDb = createMockDb({
      config: {
        accounts: [
          {
            id: 'account-id-1',
            name: 'checking',
            importerCommand: 'echo "hello world"',
            rules: [],
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const stream = await runImport('account-id-1', 'batch-id-1')
    const output = await readStream(stream)

    expect(output).toContain('hello world')
    expect(output).toContain('Import completed successfully (exit code: 0)')
  })

  it('should handle command that outputs multiple lines', async () => {
    const mockDb = createMockDb({
      config: {
        accounts: [
          {
            id: 'account-id-1',
            name: 'checking',
            importerCommand: 'echo "line1" && echo "line2" && echo "line3"',
            rules: [],
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const stream = await runImport('account-id-1', 'batch-id-1')
    const output = await readStream(stream)

    expect(output).toContain('line1')
    expect(output).toContain('line2')
    expect(output).toContain('line3')
  })

  it('should handle failed command with non-zero exit code', async () => {
    const mockDb = createMockDb({
      config: {
        accounts: [
          {
            id: 'account-id-1',
            name: 'checking',
            importerCommand: 'exit 1',
            rules: [],
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const stream = await runImport('account-id-1', 'batch-id-1')
    const output = await readStream(stream)

    expect(output).toContain('Import failed with exit code: 1')
  })

  it('should handle command not found error', async () => {
    const mockDb = createMockDb({
      config: {
        accounts: [
          {
            id: 'account-id-1',
            name: 'checking',
            importerCommand: 'nonexistentcommand12345',
            rules: [],
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const stream = await runImport('account-id-1', 'batch-id-1')
    const output = await readStream(stream)

    // Should contain either an error message or failed exit code
    expect(
      output.includes('Error executing command') ||
        output.includes('Import failed with exit code'),
    ).toBe(true)
  })
})

describe('runImport with beancount parsing', () => {
  beforeEach(() => {
    setupDbMock()
  })

  it('should fail import when beancount parsing encounters errors', async () => {
    const fixturePathInvalid = path.join(
      __dirname,
      '../test/fixtures/invalid-beancount.txt',
    )
    const mockDb = createMockDb({
      config: {
        accounts: [
          {
            id: 'account-id-1',
            name: 'savings',
            importerCommand: `cat "${fixturePathInvalid}"`,
            rules: [],
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const stream = await runImport('account-id-1', 'batch-id-1')
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
        accounts: [
          {
            id: 'account-id-1',
            name: 'empty',
            importerCommand: "echo ''",
            rules: [],
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const stream = await runImport('account-id-1', 'batch-id-1')
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
      '../test/fixtures/valid-beancount.txt',
    )
    const mockDb = createMockDb({
      config: {
        accounts: [
          {
            id: 'account-id-1',
            name: 'fail',
            importerCommand: `cat "${fixturePathValid}" && exit 1`,
            rules: [],
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const stream = await runImport('account-id-1', 'batch-id-1')
    const output = await readStream(stream)

    // Should show the raw output
    expect(output).toContain('2024-01-15 * "Grocery Store" "Weekly shopping"')

    // Should show command failure
    expect(output).toContain('Import failed with exit code: 1')

    // Should NOT parse and return beancount result for failed commands
    expect(output).not.toContain('__BEANCOUNT_RESULT__')
  })

  it('should save import result to database and return import ID', async () => {
    const fixturePathValid = path.join(
      __dirname,
      '../test/fixtures/valid-beancount.txt',
    )
    const mockDb = createMockDb({
      config: {
        accounts: [
          {
            id: 'account-id-1',
            name: 'checking',
            importerCommand: `cat "${fixturePathValid}"`,
            rules: [],
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const stream = await runImport('account-id-1', 'batch-id-1')
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
        accountId: 'account-id-1',
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
        expect(firstTx.processedTransaction).toBeDefined()
        expect(firstTx.matchedRules).toBeInstanceOf(Array)
        expect(firstTx.warnings).toBeInstanceOf(Array)
      }
    }
  })

  it('should reject beancount with unsupported entry types (open, balance, etc.)', async () => {
    const fixturePathUnsupported = path.join(
      __dirname,
      '../test/fixtures/unsupported-beancount.txt',
    )
    const mockDb = createMockDb({
      config: {
        accounts: [
          {
            id: 'account-id-1',
            name: 'checking',
            importerCommand: `cat "${fixturePathUnsupported}"`,
            rules: [],
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const stream = await runImport('account-id-1', 'batch-id-1')
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

describe('getImportResult', () => {
  beforeEach(() => {
    setupDbMock()
  })

  it('should return import result by ID', async () => {
    const mockImportResult = {
      id: 'test-uuid-123',
      accountId: 'account-id-1',
      batchId: 'batch-id-1',
      timestamp: '2024-01-15T10:00:00.000Z',
      transactions: [],
      transactionCount: 0,
    }

    const mockDb = createMockDb({
      imports: [mockImportResult],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await getImportResult('test-uuid-123')

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
        id: 'id-1',
        accountId: 'account-id-1',
        batchId: 'batch-id-1',
        timestamp: '2024-01-15T10:00:00.000Z',
        transactions: [],
        transactionCount: 0,
      },
      {
        id: 'id-2',
        accountId: 'account-id-2',
        batchId: 'batch-id-1',
        timestamp: '2024-01-15T11:00:00.000Z',
        transactions: [],
        transactionCount: 0,
      },
    ]

    const mockDb = createMockDb({
      imports: mockImports,
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const result = await getImportResult('id-2')

    expect(result).toEqual(mockImports[1])
  })
})
