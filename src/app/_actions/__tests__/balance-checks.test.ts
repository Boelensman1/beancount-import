import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { insertBalanceChecks } from '../balance-checks'
import { getDb } from '@/lib/db/db'
import { getGoCardless } from '@/lib/goCardless/goCardless'
import { createMockDb, setupDbMock } from '@/test/mocks/db'
import {
  createMockGoCardless,
  setupGoCardlessMock,
} from '@/test/mocks/goCardless'
import { createMockGoCardlessConfig, TEST_IDS } from '@/test/test-utils'
import { getDefaultBalanceTargetDate } from '@/lib/beancount/balanceChecks'

const GC_ACCOUNT_ID_1 = '00000000-0000-4000-8000-000000000101'
const GC_ACCOUNT_ID_2 = '00000000-0000-4000-8000-000000000102'

describe('insertBalanceChecks', () => {
  let testDir: string

  beforeEach(async () => {
    setupDbMock()
    setupGoCardlessMock()
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'balance-checks-test-'))
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  it('writes a balance directive using an exact reference-date balance', async () => {
    const targetDate = getDefaultBalanceTargetDate()
    const outputFile = path.join(testDir, 'checking.beancount')
    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
            name: 'Checking display name',
            balanceCheckAccount: 'Assets:Checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: outputFile,
            rules: [],
            variables: [],
            goCardless: createMockGoCardlessConfig({
              accounts: [GC_ACCOUNT_ID_1],
            }),
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const mockGoCardless = createMockGoCardless()
    mockGoCardless.getBalances.mockResolvedValue([
      {
        balanceAmount: { amount: '1000.00', currency: 'EUR' },
        balanceType: 'interimBooked',
        referenceDate: targetDate.toString(),
      },
    ])
    vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

    const result = await insertBalanceChecks([TEST_IDS.ACCOUNT_1])

    expect(result.success).toBe(true)
    expect(result.filesModified).toEqual([outputFile])
    expect(result.balanceChecks).toHaveLength(1)
    expect(result.balanceChecks?.[0]).toMatchObject({
      accountName: 'Checking display name',
      account: 'Assets:Checking',
    })

    const content = await fs.readFile(outputFile, 'utf-8')
    expect(content).toContain(
      `${targetDate.add({ days: 1 }).toString()} balance Assets:Checking`,
    )
    expect(content).toContain('1000.00 EUR')
  })

  it('rolls a newer GoCardless balance back using booked transactions', async () => {
    const targetDate = getDefaultBalanceTargetDate()
    const sourceDate = targetDate.add({ days: 1 })
    const outputFile = path.join(testDir, 'checking.beancount')
    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
            name: 'Assets:Checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: outputFile,
            rules: [],
            variables: [],
            goCardless: createMockGoCardlessConfig({
              accounts: [GC_ACCOUNT_ID_1],
            }),
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const mockGoCardless = createMockGoCardless()
    mockGoCardless.getBalances.mockResolvedValue([
      {
        balanceAmount: { amount: '1000.00', currency: 'EUR' },
        balanceType: 'interimBooked',
        referenceDate: sourceDate.toString(),
      },
    ])
    mockGoCardless.getBookedTransactionsForAccounts.mockResolvedValue([
      {
        transactionId: 'tx-1',
        transactionAmount: { amount: '10.00', currency: 'EUR' },
        bookingDate: sourceDate.toString(),
        valueDate: sourceDate.toString(),
      },
    ])
    vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

    const result = await insertBalanceChecks([TEST_IDS.ACCOUNT_1])

    expect(result.success).toBe(true)
    expect(
      mockGoCardless.getBookedTransactionsForAccounts,
    ).toHaveBeenCalledWith([GC_ACCOUNT_ID_1], targetDate, sourceDate)

    const content = await fs.readFile(outputFile, 'utf-8')
    expect(content).toContain('990.00 EUR')
  })

  it('sums balances by currency across linked GoCardless account IDs', async () => {
    const targetDate = getDefaultBalanceTargetDate()
    const outputFile = path.join(testDir, 'checking.beancount')
    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
            name: 'Assets:Checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: outputFile,
            rules: [],
            variables: [],
            goCardless: createMockGoCardlessConfig({
              accounts: [GC_ACCOUNT_ID_1, GC_ACCOUNT_ID_2],
            }),
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const mockGoCardless = createMockGoCardless()
    mockGoCardless.getBalances.mockImplementation((accountId: string) => {
      const amount = accountId === GC_ACCOUNT_ID_1 ? '100.00' : '50.00'
      return Promise.resolve([
        {
          balanceAmount: { amount, currency: 'EUR' },
          balanceType: 'interimBooked',
          referenceDate: targetDate.toString(),
        },
      ])
    })
    vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

    const result = await insertBalanceChecks([TEST_IDS.ACCOUNT_1])

    expect(result.success).toBe(true)
    expect(result.balanceChecks?.[0]).toMatchObject({
      amount: '150.00',
      currency: 'EUR',
      sourceAccountIds: [GC_ACCOUNT_ID_1, GC_ACCOUNT_ID_2],
    })

    const content = await fs.readFile(outputFile, 'utf-8')
    expect(content).toContain('150.00 EUR')
  })

  it('writes successful accounts when another selected account has no supported balance', async () => {
    const targetDate = getDefaultBalanceTargetDate()
    const checkingFile = path.join(testDir, 'checking.beancount')
    const savingsFile = path.join(testDir, 'savings.beancount')
    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
            name: 'Assets:Checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: checkingFile,
            rules: [],
            variables: [],
            goCardless: createMockGoCardlessConfig({
              accounts: [GC_ACCOUNT_ID_1],
            }),
          },
          {
            id: TEST_IDS.ACCOUNT_2,
            name: 'Assets:Savings',
            csvFilename: 'csv.csv',
            defaultOutputFile: savingsFile,
            rules: [],
            variables: [],
            goCardless: createMockGoCardlessConfig({
              accounts: [GC_ACCOUNT_ID_2],
            }),
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const mockGoCardless = createMockGoCardless()
    mockGoCardless.getBalances.mockImplementation((accountId: string) => {
      if (accountId === GC_ACCOUNT_ID_1) {
        return Promise.resolve([
          {
            balanceAmount: { amount: '100.00', currency: 'EUR' },
            balanceType: 'interimBooked',
            referenceDate: targetDate.toString(),
          },
        ])
      }

      return Promise.resolve([
        {
          balanceAmount: { amount: '999.00', currency: 'EUR' },
          balanceType: 'unknownBalance',
          referenceDate: targetDate.toString(),
        },
      ])
    })
    vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

    const result = await insertBalanceChecks([
      TEST_IDS.ACCOUNT_1,
      TEST_IDS.ACCOUNT_2,
    ])

    expect(result.success).toBe(true)
    expect(result.filesModified).toEqual([checkingFile])
    expect(result.balanceChecks).toHaveLength(1)
    expect(result.accountErrors).toEqual([
      {
        accountId: TEST_IDS.ACCOUNT_2,
        accountName: 'Assets:Savings',
        error: `No supported balance found for "Assets:Savings" GoCardless account ${GC_ACCOUNT_ID_2}. Supported types: interimBooked, closingBooked, expected, interimAvailable. Available balances: unknownBalance ${targetDate.toString()} 999.00 EUR`,
      },
    ])

    await expect(fs.readFile(checkingFile, 'utf-8')).resolves.toContain(
      '100.00 EUR',
    )
    await expect(fs.access(savingsFile)).rejects.toThrow()
  })

  it('writes successful accounts when another selected account has no balance check account', async () => {
    const targetDate = getDefaultBalanceTargetDate()
    const checkingFile = path.join(testDir, 'checking.beancount')
    const savingsFile = path.join(testDir, 'savings.beancount')
    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
            name: 'Checking display name',
            balanceCheckAccount: 'Assets:Checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: checkingFile,
            rules: [],
            variables: [],
            goCardless: createMockGoCardlessConfig({
              accounts: [GC_ACCOUNT_ID_1],
            }),
          },
          {
            id: TEST_IDS.ACCOUNT_2,
            name: 'Savings display name',
            csvFilename: 'csv.csv',
            defaultOutputFile: savingsFile,
            rules: [],
            variables: [],
            goCardless: createMockGoCardlessConfig({
              accounts: [GC_ACCOUNT_ID_2],
            }),
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const mockGoCardless = createMockGoCardless()
    mockGoCardless.getBalances.mockResolvedValue([
      {
        balanceAmount: { amount: '100.00', currency: 'EUR' },
        balanceType: 'interimBooked',
        referenceDate: targetDate.toString(),
      },
    ])
    vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

    const result = await insertBalanceChecks([
      TEST_IDS.ACCOUNT_1,
      TEST_IDS.ACCOUNT_2,
    ])

    expect(result.success).toBe(true)
    expect(result.filesModified).toEqual([checkingFile])
    expect(result.balanceChecks).toHaveLength(1)
    expect(result.accountErrors).toEqual([
      {
        accountId: TEST_IDS.ACCOUNT_2,
        accountName: 'Savings display name',
        error:
          'Account "Savings display name" has no Balance Check Account configured. Configure a Beancount account like Assets:NL:Revolut.',
      },
    ])
    expect(mockGoCardless.getBalances).toHaveBeenCalledOnce()
    expect(mockGoCardless.getBalances).toHaveBeenCalledWith(GC_ACCOUNT_ID_1)

    await expect(fs.readFile(checkingFile, 'utf-8')).resolves.toContain(
      '100.00 EUR',
    )
    await expect(fs.access(savingsFile)).rejects.toThrow()
  })

  it('blocks accounts with pending imports', async () => {
    const outputFile = path.join(testDir, 'checking.beancount')
    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
            name: 'Assets:Checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: outputFile,
            rules: [],
            variables: [],
            goCardless: createMockGoCardlessConfig({
              accounts: [GC_ACCOUNT_ID_1],
            }),
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
          csvPath: '/tmp/test.csv',
        },
      ],
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)
    const mockGoCardless = createMockGoCardless()
    vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

    const result = await insertBalanceChecks([TEST_IDS.ACCOUNT_1])

    expect(result.success).toBe(false)
    expect(result.error).toContain('pending import')
    expect(result.accountErrors).toHaveLength(1)
    expect(mockGoCardless.getBalances).not.toHaveBeenCalled()
  })

  it('uses expected balances without a reference date as current balances', async () => {
    const targetDate = getDefaultBalanceTargetDate()
    const sourceDate = targetDate.add({ days: 1 })
    const outputFile = path.join(testDir, 'checking.beancount')
    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
            name: 'Assets:Checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: outputFile,
            rules: [],
            variables: [],
            goCardless: createMockGoCardlessConfig({
              accounts: [GC_ACCOUNT_ID_1],
            }),
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const mockGoCardless = createMockGoCardless()
    mockGoCardless.getBalances.mockResolvedValue([
      {
        balanceAmount: { amount: '1000.00', currency: 'EUR' },
        balanceType: 'expected',
      },
    ])
    mockGoCardless.getBookedTransactionsForAccounts.mockResolvedValue([
      {
        transactionId: 'tx-1',
        transactionAmount: { amount: '10.00', currency: 'EUR' },
        bookingDate: sourceDate.toString(),
        valueDate: sourceDate.toString(),
      },
    ])
    vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

    const result = await insertBalanceChecks([TEST_IDS.ACCOUNT_1])

    expect(result.success).toBe(true)
    expect(result.balanceChecks?.[0]).toMatchObject({
      amount: '990.00',
      currency: 'EUR',
      sourceBalanceTypes: ['expected'],
      sourceReferenceDates: [`${sourceDate.toString()} (assumed current)`],
    })
    expect(
      mockGoCardless.getBookedTransactionsForAccounts,
    ).toHaveBeenCalledWith([GC_ACCOUNT_ID_1], targetDate, sourceDate)

    const content = await fs.readFile(outputFile, 'utf-8')
    expect(content).toContain('990.00 EUR')
  })

  it('includes balance details when no supported balance exists', async () => {
    const targetDate = getDefaultBalanceTargetDate()
    const outputFile = path.join(testDir, 'checking.beancount')
    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
            name: 'Assets:Checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: outputFile,
            rules: [],
            variables: [],
            goCardless: createMockGoCardlessConfig({
              accounts: [GC_ACCOUNT_ID_1],
            }),
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const mockGoCardless = createMockGoCardless()
    mockGoCardless.getBalances.mockResolvedValue([
      {
        balanceAmount: { amount: '999.00', currency: 'EUR' },
        balanceType: 'unknownBalance',
        referenceDate: targetDate.toString(),
      },
    ])
    vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

    const result = await insertBalanceChecks([TEST_IDS.ACCOUNT_1])

    expect(result.success).toBe(false)
    expect(result.error).toContain('Supported types:')
    expect(result.error).toContain(
      `unknownBalance ${targetDate.toString()} 999.00 EUR`,
    )
    expect(result.accountErrors).toHaveLength(1)
  })

  it('reports none when GoCardless returns no balances', async () => {
    const outputFile = path.join(testDir, 'checking.beancount')
    const mockDb = createMockDb({
      config: {
        defaults: { beangulpCommand: '' },
        accounts: [
          {
            id: TEST_IDS.ACCOUNT_1,
            name: 'Assets:Checking',
            csvFilename: 'csv.csv',
            defaultOutputFile: outputFile,
            rules: [],
            variables: [],
            goCardless: createMockGoCardlessConfig({
              accounts: [GC_ACCOUNT_ID_1],
            }),
          },
        ],
      },
    })
    vi.mocked(getDb).mockResolvedValue(mockDb)

    const mockGoCardless = createMockGoCardless()
    mockGoCardless.getBalances.mockResolvedValue([])
    vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

    const result = await insertBalanceChecks([TEST_IDS.ACCOUNT_1])

    expect(result.success).toBe(false)
    expect(result.error).toContain('Available balances: none')
    expect(result.accountErrors).toHaveLength(1)
  })
})
