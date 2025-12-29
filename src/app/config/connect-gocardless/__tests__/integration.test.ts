import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Temporal } from '@js-temporal/polyfill'
import { disconnectGoCardless, completeGoCardlessConnection } from '../actions'
import { getDb } from '@/lib/db/db'
import { getGoCardless } from '@/lib/goCardless/goCardless'
import { createMockDb, setupDbMock } from '@/test/mocks/db'
import {
  createMockGoCardless,
  setupGoCardlessMock,
} from '@/test/mocks/goCardless'
import { createMockGoCardlessConfig } from '@/test/test-utils'
import crypto from 'crypto'

describe('GoCardless Connection Integration Tests', () => {
  beforeEach(() => {
    setupDbMock()
    setupGoCardlessMock()
  })

  describe('Full connection flow', () => {
    it('should complete full connection flow from scratch', async () => {
      const accountId = crypto.randomUUID()
      const reqRef = 'test-req-ref-123'
      const countryCode = 'GB'
      const bankId = 'BANK123'
      const mockAccountIds = [crypto.randomUUID(), crypto.randomUUID()]

      // Start with account without goCardless
      const mockDb = createMockDb({
        config: {
          defaults: {
            beangulpCommand: '',
          },
          accounts: [
            {
              id: accountId,
              name: 'My Bank Account',
              csvFilename: 'csv.csv',
              defaultOutputFile: 'test.beancount',
              rules: [],
              variables: [],
              // No goCardless field
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const mockGoCardless = createMockGoCardless({
        listAccounts: vi.fn().mockResolvedValue(mockAccountIds),
      })
      vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

      // Complete the connection
      const result = await completeGoCardlessConnection(
        accountId,
        reqRef,
        countryCode,
        bankId,
      )

      // Verify success
      expect(result.success).toBe(true)
      expect(result.message).toBe('Connection completed successfully!')

      // Verify account was updated
      const account = mockDb.data.config.accounts[0]
      expect(account.goCardless).toBeDefined()

      // Verify all fields are correct
      expect(account.goCardless!.countryCode).toBe(countryCode)
      expect(account.goCardless!.bankId).toBe(bankId)
      expect(account.goCardless!.reqRef).toBe(reqRef)
      expect(account.goCardless!.accounts).toEqual(mockAccountIds)
      expect(account.goCardless!.importedTill.toString()).toBe('1970-01-01')

      // Parse and verify endUserAgreementValidTill
      const validTill = Temporal.Instant.from(
        account.goCardless!.endUserAgreementValidTill as unknown as string,
      )

      // Use zonedDateTimeISO to match mock which handles DST correctly
      const expected = Temporal.Now.zonedDateTimeISO()
        .add({ days: 90 })
        .toInstant()
      const diffMs = validTill.epochMilliseconds - expected.epochMilliseconds
      expect(Math.abs(diffMs)).toBeLessThanOrEqual(1000) // 1 second tolerance

      // Verify database was saved
      expect(mockDb.write).toHaveBeenCalled()

      // Verify other account data was preserved
      expect(account.name).toBe('My Bank Account')
      expect(account.csvFilename).toBe('csv.csv')
      expect(account.defaultOutputFile).toBe('test.beancount')
    })
  })

  describe('Disconnection flow', () => {
    it('should disconnect and preserve other account data', async () => {
      const accountId = crypto.randomUUID()
      const goCardlessConfig = createMockGoCardlessConfig()

      // Start with connected account
      const mockDb = createMockDb({
        config: {
          defaults: {
            beangulpCommand: '',
          },
          accounts: [
            {
              id: accountId,
              name: 'Connected Account',
              csvFilename: 'csv.csv',
              defaultOutputFile: 'connected.beancount',
              rules: [],
              variables: [],
              goCardless: goCardlessConfig,
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      // Disconnect
      const result = await disconnectGoCardless(accountId)

      // Verify success
      expect(result.success).toBe(true)

      // Verify goCardless field was removed
      const account = mockDb.data.config.accounts[0]
      expect(account.goCardless).toBeUndefined()

      // Verify other account data was preserved
      expect(account.id).toBe(accountId)
      expect(account.name).toBe('Connected Account')
      expect(account.csvFilename).toBe('csv.csv')
      expect(account.defaultOutputFile).toBe('connected.beancount')
      expect(account.rules).toEqual([])

      // Verify database was saved
      expect(mockDb.write).toHaveBeenCalled()
    })
  })

  describe('Reconnection flow', () => {
    it('should replace old connection with new data', async () => {
      const accountId = crypto.randomUUID()

      // Start with expired connection
      const oldConfig = createMockGoCardlessConfig()
      // Make it expired by setting validTill to the past (1 day ago)
      oldConfig.endUserAgreementValidTill = Temporal.Now.instant().subtract({
        seconds: 24 * 3600,
      })

      const mockDb = createMockDb({
        config: {
          defaults: {
            beangulpCommand: '',
          },
          accounts: [
            {
              id: accountId,
              name: 'Expired Account',
              csvFilename: 'csv.csv',
              defaultOutputFile: 'test.beancount',
              rules: [],
              variables: [],
              goCardless: oldConfig,
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const newAccountIds = [crypto.randomUUID(), crypto.randomUUID()]
      const mockGoCardless = createMockGoCardless({
        listAccounts: vi.fn().mockResolvedValue(newAccountIds),
      })
      vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

      // Reconnect
      const result = await completeGoCardlessConnection(
        accountId,
        'new-req-ref',
        'FR',
        'NEW_BANK',
      )

      // Verify success
      expect(result.success).toBe(true)

      // Verify old data was replaced
      const account = mockDb.data.config.accounts[0]
      expect(account.goCardless!.countryCode).toBe('FR')
      expect(account.goCardless!.bankId).toBe('NEW_BANK')
      expect(account.goCardless!.reqRef).toBe('new-req-ref')
      expect(account.goCardless!.accounts).toEqual(newAccountIds)

      // Verify new connection is not expired
      const now = Temporal.Now.instant()
      const isExpired =
        Temporal.Instant.compare(
          account.goCardless!.endUserAgreementValidTill,
          now,
        ) < 0
      expect(isExpired).toBe(false)

      // Verify database was saved
      expect(mockDb.write).toHaveBeenCalled()
    })
  })

  describe('Multiple accounts', () => {
    it('should only affect the target account', async () => {
      const accountId1 = crypto.randomUUID()
      const accountId2 = crypto.randomUUID()

      const mockDb = createMockDb({
        config: {
          defaults: {
            beangulpCommand: '',
          },
          accounts: [
            {
              id: accountId1,
              name: 'Account 1',
              csvFilename: 'csv.csv',
              defaultOutputFile: '1.beancount',
              rules: [],
              variables: [],
              goCardless: createMockGoCardlessConfig(),
            },
            {
              id: accountId2,
              name: 'Account 2',
              csvFilename: 'csv2.csv',
              defaultOutputFile: '2.beancount',
              rules: [],
              variables: [],
              goCardless: createMockGoCardlessConfig(),
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      // Disconnect only account 1
      await disconnectGoCardless(accountId1)

      // Verify account 1 was disconnected
      expect(mockDb.data.config.accounts[0].goCardless).toBeUndefined()

      // Verify account 2 was not affected
      expect(mockDb.data.config.accounts[1].goCardless).toBeDefined()
    })
  })

  describe('Error handling', () => {
    it('should not save to database if API call fails', async () => {
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
        listAccounts: vi.fn().mockRejectedValue(new Error('API Error')),
      })
      vi.mocked(getGoCardless).mockResolvedValue(mockGoCardless)

      const result = await completeGoCardlessConnection(
        accountId,
        'ref',
        'GB',
        'BANK',
      )

      // Verify failure
      expect(result.success).toBe(false)

      // Verify account was not modified
      const account = mockDb.data.config.accounts[0]
      expect(account.goCardless).toBeUndefined()

      // Verify database was not saved
      expect(mockDb.write).not.toHaveBeenCalled()
    })
  })
})
