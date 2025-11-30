import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Temporal } from '@js-temporal/polyfill'
import {
  disconnectGoCardless,
  getBanksForCountry,
  completeGoCardlessConnection,
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
          defaults: {},
          accounts: [
            {
              id: accountId,
              name: 'Test Account',
              importerCommand: 'echo test',
              defaultOutputFile: 'test.beancount',
              rules: [],
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
          defaults: {},
          accounts: [
            {
              id: accountId,
              name: 'Test Account',
              importerCommand: 'echo test',
              defaultOutputFile: 'test.beancount',
              rules: [],
              goCardless: createMockGoCardlessConfig(),
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      await disconnectGoCardless(accountId)

      const account = mockDb.data.config.accounts[0]
      expect(account.name).toBe('Test Account')
      expect(account.importerCommand).toBe('echo test')
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
          defaults: {},
          accounts: [
            {
              id: accountId,
              name: 'Test Account',
              importerCommand: 'echo test',
              defaultOutputFile: 'test.beancount',
              rules: [],
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
          defaults: {},
          accounts: [
            {
              id: accountId,
              name: 'Test Account',
              importerCommand: 'echo test',
              defaultOutputFile: 'test.beancount',
              rules: [],
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

      expect(result.success).toBe(true)
      expect(result.message).toBe('Connection completed successfully!')

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
          defaults: {},
          accounts: [
            {
              id: accountId,
              name: 'Test Account',
              importerCommand: 'echo test',
              defaultOutputFile: 'test.beancount',
              rules: [],
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
      const now = Temporal.Now.instant()
      // 90 days in seconds
      const expected = now.add({
        seconds: 90 * 24 * 3600,
      })

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
          defaults: {},
          accounts: [
            {
              id: accountId,
              name: 'Test Account',
              importerCommand: 'echo test',
              defaultOutputFile: 'test.beancount',
              rules: [],
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
          defaults: {},
          accounts: [
            {
              id: accountId,
              name: 'Test Account',
              importerCommand: 'echo test',
              defaultOutputFile: 'test.beancount',
              rules: [],
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
          defaults: {},
          accounts: [
            {
              id: accountId,
              name: 'Test Account',
              importerCommand: 'echo test',
              defaultOutputFile: 'test.beancount',
              rules: [],
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
  })
})
