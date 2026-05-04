import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Temporal } from '@js-temporal/polyfill'
import {
  disconnectGoCardless,
  getBanksForCountry,
  completeGoCardlessConnection,
  reconnectGoCardless,
  downloadGoCardlessCsv,
} from '../actions'
import { getDb } from '@/lib/db/db'
import { getGoCardless } from '@/lib/goCardless/goCardless'
import { createMockDb, setupDbMock } from '@/test/mocks/db'
import {
  createMockGoCardless,
  setupGoCardlessMock,
} from '@/test/mocks/goCardless'
import { createMockGoCardlessConfig } from '@/test/test-utils'
import crypto from 'crypto'

describe('GoCardless Connection Actions', () => {
  beforeEach(() => {
    setupDbMock()
    setupGoCardlessMock()
  })

  describe('disconnectGoCardless', () => {
    it('should successfully remove goCardless field from account', async () => {
      const accountId = crypto.randomUUID()
      const mockDb = createMockDb({
        config: {
          defaults: {
            beangulpCommand: '',
          },
          accounts: [
            {
              id: accountId,
              name: 'Test Account',
              csvFilename: 'csv.csv',
              defaultOutputFile: 'test.beancount',
              rules: [],
              variables: [],
              goCardless: createMockGoCardlessConfig(),
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const result = await disconnectGoCardless(accountId)

      expect(result.success).toBe(true)
      expect(result.message).toBe('Disconnected successfully')
      expect(mockDb.data.config.accounts[0].goCardless).toBeUndefined()
      expect(mockDb.write).toHaveBeenCalled()
    })

    it('should preserve other account data when disconnecting', async () => {
      const accountId = crypto.randomUUID()
      const mockDb = createMockDb({
        config: {
          defaults: {
            beangulpCommand: '',
          },
          accounts: [
            {
              id: accountId,
              name: 'Test Account',
              csvFilename: 'csv.csv',
              defaultOutputFile: 'test.beancount',
              rules: [],
              variables: [],
              goCardless: createMockGoCardlessConfig(),
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      await disconnectGoCardless(accountId)

      const account = mockDb.data.config.accounts[0]
      expect(account.name).toBe('Test Account')
      expect(account.csvFilename).toBe('csv.csv')
      expect(account.defaultOutputFile).toBe('test.beancount')
    })

    it('should return error for non-existent account', async () => {
      const mockDb = createMockDb()
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const result = await disconnectGoCardless('non-existent-id')

      expect(result.success).toBe(false)
      expect(result.message).toBe('Account not found')
    })

    it('should handle account without goCardless field gracefully', async () => {
      const accountId = crypto.randomUUID()
      const mockDb = createMockDb({
        config: {
          defaults: {
            beangulpCommand: '',
          },
          accounts: [
            {
              id: accountId,
              name: 'Test Account',
              csvFilename: 'csv.csv',
              defaultOutputFile: 'test.beancount',
              rules: [],
              variables: [],
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const result = await disconnectGoCardless(accountId)

      expect(result.success).toBe(true)
      expect(mockDb.write).toHaveBeenCalled()
    })
  })

  describe('getBanksForCountry', () => {
    it('should return banks for valid country', async () => {
      const mockBanks = [
        { id: 'BANK1', name: 'Test Bank 1', country_code: 'GB' },
        { id: 'BANK2', name: 'Test Bank 2', country_code: 'GB' },
      ]
      const mockGoCardless = createMockGoCardless({
        getListOfBanks: vi.fn().mockResolvedValue(mockBanks),
      })
      vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

      const result = await getBanksForCountry('GB')

      expect(result.success).toBe(true)
      expect(result.banks).toEqual(mockBanks)
      expect(mockGoCardless.getListOfBanks).toHaveBeenCalledWith('GB')
    })

    it('should handle GoCardless API errors', async () => {
      const mockGoCardless = createMockGoCardless({
        getListOfBanks: vi
          .fn()
          .mockRejectedValue(new Error('API connection failed')),
      })
      vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

      const result = await getBanksForCountry('GB')

      expect(result.success).toBe(false)
      expect(result.error).toBe('API connection failed')
    })

    it('should handle missing credentials', async () => {
      vi.mocked(getGoCardless).mockRejectedValue(
        new Error('GoCardless not configured'),
      )

      const result = await getBanksForCountry('GB')

      expect(result.success).toBe(false)
      expect(result.error).toBe('GoCardless not configured')
    })
  })

  describe('completeGoCardlessConnection', () => {
    it('should save connection data correctly', async () => {
      const accountId = crypto.randomUUID()
      const reqRef = 'test-req-ref'
      const mockAccounts = [crypto.randomUUID(), crypto.randomUUID()]

      const mockDb = createMockDb({
        config: {
          defaults: {
            beangulpCommand: '',
          },
          accounts: [
            {
              id: accountId,
              name: 'Test Account',
              csvFilename: 'csv.csv',
              defaultOutputFile: 'test.beancount',
              rules: [],
              variables: [],
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const mockGoCardless = createMockGoCardless({
        listAccounts: vi.fn().mockResolvedValue(mockAccounts),
      })
      vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

      const result = await completeGoCardlessConnection(
        accountId,
        reqRef,
        'GB',
        'BANK123',
      )

      expect(result.message).toBe('Connection completed successfully!')
      expect(result.success).toBe(true)

      const account = mockDb.data.config.accounts[0]
      expect(account.goCardless).toBeDefined()
      expect(account.goCardless!.countryCode).toBe('GB')
      expect(account.goCardless!.bankId).toBe('BANK123')
      expect(account.goCardless!.reqRef).toBe(reqRef)
      expect(account.goCardless!.accounts).toEqual(mockAccounts)
      expect(mockDb.write).toHaveBeenCalled()
    })

    it('should set endUserAgreementValidTill to 90 days from now', async () => {
      const accountId = crypto.randomUUID()
      const mockDb = createMockDb({
        config: {
          defaults: {
            beangulpCommand: '',
          },
          accounts: [
            {
              id: accountId,
              name: 'Test Account',
              csvFilename: 'csv.csv',
              defaultOutputFile: 'test.beancount',
              rules: [],
              variables: [],
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const mockGoCardless = createMockGoCardless({
        listAccounts: vi.fn().mockResolvedValue([]),
      })
      vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

      await completeGoCardlessConnection(accountId, 'ref', 'GB', 'BANK123')

      const account = mockDb.data.config.accounts[0]
      const validTill = account.goCardless!
        .endUserAgreementValidTill as unknown as string
      // Use zonedDateTimeISO to match mock which handles DST correctly
      const expected = Temporal.Now.zonedDateTimeISO()
        .add({ days: 90 })
        .toInstant()

      // After serialization, it's a string, so parse it back
      const parsedValidTill = Temporal.Instant.from(validTill)
      const diffMs =
        parsedValidTill.epochMilliseconds - expected.epochMilliseconds
      expect(Math.abs(diffMs)).toBeLessThanOrEqual(1000)
    })

    it('should set importedTill to epoch', async () => {
      const accountId = crypto.randomUUID()
      const mockDb = createMockDb({
        config: {
          defaults: {
            beangulpCommand: '',
          },
          accounts: [
            {
              id: accountId,
              name: 'Test Account',
              csvFilename: 'csv.csv',
              defaultOutputFile: 'test.beancount',
              rules: [],
              variables: [],
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const mockGoCardless = createMockGoCardless({
        listAccounts: vi.fn().mockResolvedValue([]),
      })
      vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

      await completeGoCardlessConnection(accountId, 'ref', 'GB', 'BANK123')

      const account = mockDb.data.config.accounts[0]
      expect(account.goCardless!.importedTill.toString()).toBe('1970-01-01')
    })

    it('should call listAccounts and save account IDs', async () => {
      const accountId = crypto.randomUUID()
      const reqRef = 'test-req-ref'
      const mockAccounts = [
        'acc-id-1',
        'acc-id-2',
        'acc-id-3',
      ] as unknown as string[]

      const mockDb = createMockDb({
        config: {
          defaults: {
            beangulpCommand: '',
          },
          accounts: [
            {
              id: accountId,
              name: 'Test Account',
              csvFilename: 'csv.csv',
              defaultOutputFile: 'test.beancount',
              rules: [],
              variables: [],
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const mockGoCardless = createMockGoCardless({
        listAccounts: vi.fn().mockResolvedValue(mockAccounts),
      })
      vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

      await completeGoCardlessConnection(accountId, reqRef, 'GB', 'BANK123')

      expect(mockGoCardless.listAccounts).toHaveBeenCalledWith(reqRef)

      const account = mockDb.data.config.accounts[0]
      expect(account.goCardless!.accounts).toEqual(mockAccounts)
    })

    it('should return error for invalid reqRef', async () => {
      const accountId = crypto.randomUUID()
      const mockDb = createMockDb({
        config: {
          defaults: {
            beangulpCommand: '',
          },
          accounts: [
            {
              id: accountId,
              name: 'Test Account',
              csvFilename: 'csv.csv',
              defaultOutputFile: 'test.beancount',
              rules: [],
              variables: [],
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const mockGoCardless = createMockGoCardless({
        listAccounts: vi
          .fn()
          .mockRejectedValue(new Error('Invalid requisition')),
      })
      vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

      const result = await completeGoCardlessConnection(
        accountId,
        'invalid-ref',
        'GB',
        'BANK123',
      )

      expect(result.success).toBe(false)
      expect(result.message).toBe('Invalid requisition')
    })

    it('should return error for non-existent account', async () => {
      const mockDb = createMockDb()
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const result = await completeGoCardlessConnection(
        'non-existent-id',
        'ref',
        'GB',
        'BANK123',
      )

      expect(result.success).toBe(false)
      expect(result.message).toBe('Account not found')
    })

    it('should preserve importedTill on reconnect', async () => {
      const accountId = crypto.randomUUID()
      const existingImportedTill = Temporal.PlainDate.from('2025-06-15')
      const mockDb = createMockDb({
        config: {
          defaults: { beangulpCommand: '' },
          accounts: [
            {
              id: accountId,
              name: 'Test Account',
              csvFilename: 'csv.csv',
              defaultOutputFile: 'test.beancount',
              rules: [],
              variables: [],
              goCardless: createMockGoCardlessConfig({
                importedTill: existingImportedTill,
              }),
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const mockGoCardless = createMockGoCardless({
        listAccounts: vi.fn().mockResolvedValue([]),
      })
      vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

      await completeGoCardlessConnection(accountId, 'new-ref', 'GB', 'BANK123')

      const account = mockDb.data.config.accounts[0]
      expect(account.goCardless!.importedTill.toString()).toBe('2025-06-15')
    })

    it('should preserve reversePayee on reconnect', async () => {
      const accountId = crypto.randomUUID()
      const mockDb = createMockDb({
        config: {
          defaults: { beangulpCommand: '' },
          accounts: [
            {
              id: accountId,
              name: 'Test Account',
              csvFilename: 'csv.csv',
              defaultOutputFile: 'test.beancount',
              rules: [],
              variables: [],
              goCardless: createMockGoCardlessConfig({
                reversePayee: true,
              }),
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const mockGoCardless = createMockGoCardless({
        listAccounts: vi.fn().mockResolvedValue([]),
      })
      vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

      await completeGoCardlessConnection(accountId, 'new-ref', 'GB', 'BANK123')

      const account = mockDb.data.config.accounts[0]
      expect(account.goCardless!.reversePayee).toBe(true)
    })
  })

  describe('reconnectGoCardless', () => {
    it('should return OAuth link using stored bankId', async () => {
      const accountId = crypto.randomUUID()
      const mockDb = createMockDb({
        config: {
          defaults: { beangulpCommand: '' },
          accounts: [
            {
              id: accountId,
              name: 'Test Account',
              csvFilename: 'csv.csv',
              defaultOutputFile: 'test.beancount',
              rules: [],
              variables: [],
              goCardless: createMockGoCardlessConfig({
                bankId: 'MY_BANK',
                countryCode: 'DE',
              }),
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const mockGoCardless = createMockGoCardless({
        getRequisitionRef: vi
          .fn()
          .mockResolvedValue({ link: 'https://oauth.example.com' }),
      })
      vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

      const result = await reconnectGoCardless(accountId)

      expect(result.success).toBe(true)
      expect(result.link).toBe('https://oauth.example.com')
      expect(mockGoCardless.getRequisitionRef).toHaveBeenCalledWith(
        'MY_BANK',
        expect.stringContaining(
          `/config/connect-gocardless/${accountId}/callback`,
        ),
      )
    })

    it('should return error for non-existent account', async () => {
      const mockDb = createMockDb()
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const result = await reconnectGoCardless('non-existent-id')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Account not found')
    })

    it('should return error for account without goCardless', async () => {
      const accountId = crypto.randomUUID()
      const mockDb = createMockDb({
        config: {
          defaults: { beangulpCommand: '' },
          accounts: [
            {
              id: accountId,
              name: 'Test Account',
              csvFilename: 'csv.csv',
              defaultOutputFile: 'test.beancount',
              rules: [],
              variables: [],
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const result = await reconnectGoCardless(accountId)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Account has no GoCardless connection')
    })
  })

  describe('downloadGoCardlessCsv', () => {
    function createDbWithGoCardlessAccount(
      accountId: string,
      configOverrides: Parameters<typeof createMockGoCardlessConfig>[0] = {},
    ) {
      return createMockDb({
        config: {
          defaults: { beangulpCommand: '' },
          accounts: [
            {
              id: accountId,
              name: 'Checking Account',
              csvFilename: 'csv.csv',
              defaultOutputFile: 'test.beancount',
              rules: [],
              variables: [],
              goCardless: createMockGoCardlessConfig(configOverrides),
            },
          ],
        },
      })
    }

    it('should return error for non-existent account', async () => {
      const mockDb = createMockDb()
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const result = await downloadGoCardlessCsv('non-existent-id')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Account not found')
    })

    it('should return error when account has no GoCardless connection', async () => {
      const accountId = crypto.randomUUID()
      const mockDb = createMockDb({
        config: {
          defaults: { beangulpCommand: '' },
          accounts: [
            {
              id: accountId,
              name: 'Test',
              csvFilename: 'csv.csv',
              defaultOutputFile: 'test.beancount',
              rules: [],
              variables: [],
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const result = await downloadGoCardlessCsv(accountId)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Account has no GoCardless connection')
    })

    it('should return error when GoCardless connection has expired', async () => {
      const accountId = crypto.randomUUID()
      const mockDb = createDbWithGoCardlessAccount(accountId, {
        endUserAgreementValidTill: Temporal.Instant.from(
          '2000-01-01T00:00:00Z',
        ),
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const result = await downloadGoCardlessCsv(accountId)

      expect(result.success).toBe(false)
      expect(result.error).toContain('expired')
    })

    it('should request transactions for the maximum historical period', async () => {
      const accountId = crypto.randomUUID()
      const goCardlessAccountId = crypto.randomUUID()
      const mockDb = createDbWithGoCardlessAccount(accountId, {
        accounts: [goCardlessAccountId],
        reqRef: 'req-ref-xyz',
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const mockGoCardless = createMockGoCardless({
        getMaxHistoricalDays: vi.fn().mockResolvedValue(500),
        getTransationsForAccounts: vi.fn().mockResolvedValue([
          {
            id: 'tx1',
            date: Temporal.PlainDate.from('2025-06-01'),
            bookingDate: Temporal.PlainDate.from('2025-06-01'),
            amount: '12.34',
            currency: 'EUR',
            payee: 'Coffee Shop',
            narration: 'Latte',
          },
        ]),
      })
      vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

      const result = await downloadGoCardlessCsv(accountId)

      expect(result.success).toBe(true)
      expect(mockGoCardless.getMaxHistoricalDays).toHaveBeenCalledWith(
        'req-ref-xyz',
      )

      const today = Temporal.Now.zonedDateTimeISO().toPlainDate()
      const expectedFrom = today.subtract({ days: 500 })
      const expectedTo = today.subtract({ days: 1 })

      const callArgs = mockGoCardless.getTransationsForAccounts.mock.calls[0]
      expect(callArgs[0]).toEqual([goCardlessAccountId])
      expect((callArgs[1] as Temporal.PlainDate).toString()).toBe(
        expectedFrom.toString(),
      )
      expect((callArgs[2] as Temporal.PlainDate).toString()).toBe(
        expectedTo.toString(),
      )
      expect(callArgs[3]).toBe(2)
      expect(callArgs[4]).toBe(false)

      expect(result.importedFrom).toBe(expectedFrom.toString())
      expect(result.importedTo).toBe(expectedTo.toString())
    })

    it('should return CSV content with header row and data', async () => {
      const accountId = crypto.randomUUID()
      const mockDb = createDbWithGoCardlessAccount(accountId)
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const mockGoCardless = createMockGoCardless({
        getMaxHistoricalDays: vi.fn().mockResolvedValue(90),
        getTransationsForAccounts: vi.fn().mockResolvedValue([
          {
            id: 'tx1',
            date: Temporal.PlainDate.from('2025-06-01'),
            bookingDate: Temporal.PlainDate.from('2025-06-01'),
            amount: '12.34',
            currency: 'EUR',
            payee: 'Coffee Shop',
            narration: 'Latte',
          },
        ]),
      })
      vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

      const result = await downloadGoCardlessCsv(accountId)

      expect(result.success).toBe(true)
      expect(result.csv).toContain(
        'id,date,bookingDate,amount,currency,payee,narration',
      )
      expect(result.csv).toContain('tx1,2025-06-01,2025-06-01,12.34,EUR')
    })

    it('should build the filename from the account csvFilename template', async () => {
      const accountId = crypto.randomUUID()
      const mockDb = createDbWithGoCardlessAccount(accountId)
      mockDb.data.config.accounts[0].name = 'checking'
      mockDb.data.config.accounts[0].csvFilename =
        '$account.$importedFrom.$importedTo.grabber.csv'
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const mockGoCardless = createMockGoCardless({
        getMaxHistoricalDays: vi.fn().mockResolvedValue(30),
        getTransationsForAccounts: vi.fn().mockResolvedValue([
          {
            id: 'tx1',
            date: Temporal.PlainDate.from('2025-06-01'),
            bookingDate: Temporal.PlainDate.from('2025-06-01'),
            amount: '1.00',
            currency: 'EUR',
          },
        ]),
      })
      vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

      const result = await downloadGoCardlessCsv(accountId)

      expect(result.success).toBe(true)
      expect(result.filename).toMatch(/^checking\.\d{8}\.\d{8}\.grabber\.csv$/)
    })

    it('should not modify the database', async () => {
      const accountId = crypto.randomUUID()
      const originalImportedTill = Temporal.PlainDate.from('2024-11-01')
      const mockDb = createDbWithGoCardlessAccount(accountId, {
        importedTill: originalImportedTill,
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const mockGoCardless = createMockGoCardless({
        getMaxHistoricalDays: vi.fn().mockResolvedValue(30),
        getTransationsForAccounts: vi.fn().mockResolvedValue([
          {
            id: 'tx1',
            date: Temporal.PlainDate.from('2025-06-01'),
            bookingDate: Temporal.PlainDate.from('2025-06-01'),
            amount: '1.00',
            currency: 'EUR',
          },
        ]),
      })
      vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

      await downloadGoCardlessCsv(accountId)

      expect(mockDb.write).not.toHaveBeenCalled()
      expect(
        mockDb.data.config.accounts[0].goCardless!.importedTill.toString(),
      ).toBe(originalImportedTill.toString())
    })

    it('should return an error when no transactions are returned', async () => {
      const accountId = crypto.randomUUID()
      const mockDb = createDbWithGoCardlessAccount(accountId)
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const mockGoCardless = createMockGoCardless({
        getMaxHistoricalDays: vi.fn().mockResolvedValue(30),
        getTransationsForAccounts: vi.fn().mockResolvedValue([]),
      })
      vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

      const result = await downloadGoCardlessCsv(accountId)

      expect(result.success).toBe(false)
      expect(result.error).toBe('No transactions returned')
    })

    it('should propagate GoCardless API errors', async () => {
      const accountId = crypto.randomUUID()
      const mockDb = createDbWithGoCardlessAccount(accountId)
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const mockGoCardless = createMockGoCardless({
        getMaxHistoricalDays: vi
          .fn()
          .mockRejectedValue(new Error('Upstream failure')),
      })
      vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

      const result = await downloadGoCardlessCsv(accountId)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Upstream failure')
    })
  })
})
