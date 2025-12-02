import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Temporal } from '@js-temporal/polyfill'
import { getDb, resetDb, setDbFilePath } from '../db'

// Unmock the db module for this test file since we're testing the real implementation
vi.unmock('../db.ts')

let TEST_DB_DIR: string
let TEST_DB_FILE: string

beforeEach(() => {
  TEST_DB_DIR = mkdtempSync(join(tmpdir(), 'beancount-test-deserialization-'))
  TEST_DB_FILE = join(TEST_DB_DIR, 'db.json')
  resetDb()
  setDbFilePath(TEST_DB_FILE)
})

afterEach(() => {
  resetDb()
  if (existsSync(TEST_DB_DIR)) {
    rmSync(TEST_DB_DIR, { recursive: true })
  }
})

describe('Database Deserialization', () => {
  describe('getDb()', () => {
    it('should deserialize GoCardless Temporal fields when reading from JSON', async () => {
      // Arrange: Create a database with GoCardless config
      const accountId = crypto.randomUUID()
      const validTill = Temporal.Instant.from('2025-11-01T00:00:00Z')
      const importedTill = Temporal.PlainDate.from('2024-11-01')

      const db = await getDb()
      db.data.config.accounts = [
        {
          id: accountId,
          name: 'Test Account',
          csvFilename: 'csv.csv',
          defaultOutputFile: '/test/output.beancount',
          rules: [],
          goCardless: {
            countryCode: 'GB',
            bankId: 'SANDBOXFINANCE_SFIN0000',
            reqRef: 'test-requisition-ref',
            accounts: [crypto.randomUUID()],
            importedTill,
            endUserAgreementValidTill: validTill,
          },
        },
      ]

      // Act: Write to disk and reset db instance
      await db.write()
      resetDb()
      setDbFilePath(TEST_DB_FILE)

      // Get fresh instance which should deserialize from JSON
      const freshDb = await getDb()
      const account = freshDb.data.config.accounts[0]

      // Assert: Temporal objects should be properly deserialized
      expect(account).toBeDefined()
      expect(account.goCardless).toBeDefined()
      expect(account.goCardless!.endUserAgreementValidTill).toBeInstanceOf(
        Temporal.Instant,
      )
      expect(account.goCardless!.importedTill).toBeInstanceOf(
        Temporal.PlainDate,
      )

      // Verify values are correct
      expect(account.goCardless!.endUserAgreementValidTill.toString()).toBe(
        '2025-11-01T00:00:00Z',
      )
      expect(account.goCardless!.importedTill.toString()).toBe('2024-11-01')
    })

    it('should allow Temporal methods to be called on deserialized objects', async () => {
      // Arrange
      const accountId = crypto.randomUUID()
      const validTill = Temporal.Instant.from('2025-11-01T00:00:00Z')

      const db = await getDb()
      db.data.config.accounts = [
        {
          id: accountId,
          name: 'Test Account',
          csvFilename: 'csv.csv',
          defaultOutputFile: '/test/output.beancount',
          rules: [],
          goCardless: {
            countryCode: 'GB',
            bankId: 'SANDBOXFINANCE_SFIN0000',
            reqRef: 'test-requisition-ref',
            accounts: [],
            importedTill: Temporal.PlainDate.from('2024-11-01'),
            endUserAgreementValidTill: validTill,
          },
        },
      ]

      await db.write()
      resetDb()
      setDbFilePath(TEST_DB_FILE)

      // Act
      const freshDb = await getDb()
      const account = freshDb.data.config.accounts[0]

      // Assert: Should be able to call Temporal methods
      expect(() => {
        const date = account
          .goCardless!.endUserAgreementValidTill.toZonedDateTimeISO('UTC')
          .toPlainDate()
          .toString()
        expect(date).toBe('2025-11-01')
      }).not.toThrow()
    })

    it('should handle accounts without goCardless config', async () => {
      // Arrange
      const accountId = crypto.randomUUID()

      const db = await getDb()
      db.data.config.accounts = [
        {
          id: accountId,
          name: 'Test Account',
          csvFilename: 'csv.csv',
          defaultOutputFile: '/test/output.beancount',
          rules: [],
        },
      ]

      // Act
      await db.write()
      resetDb()
      setDbFilePath(TEST_DB_FILE)

      const freshDb = await getDb()
      const account = freshDb.data.config.accounts[0]

      // Assert
      expect(account.goCardless).toBeUndefined()
    })
  })

  describe('.write()', () => {
    it('should preserve Temporal objects after write', async () => {
      // Arrange
      const accountId = crypto.randomUUID()
      const validTill = Temporal.Instant.from('2025-11-01T00:00:00Z')
      const importedTill = Temporal.PlainDate.from('2024-11-01')

      const db = await getDb()
      db.data.config.accounts = [
        {
          id: accountId,
          name: 'Test Account',
          csvFilename: 'csv.csv',
          defaultOutputFile: '/test/output.beancount',
          rules: [],
          goCardless: {
            countryCode: 'GB',
            bankId: 'SANDBOXFINANCE_SFIN0000',
            reqRef: 'test-requisition-ref',
            accounts: [],
            importedTill,
            endUserAgreementValidTill: validTill,
          },
        },
      ]

      // Act: Write to disk
      await db.write()

      // Assert: db.data should still have Temporal objects (not strings)
      const account = db.data.config.accounts[0]
      expect(account.goCardless!.endUserAgreementValidTill).toBeInstanceOf(
        Temporal.Instant,
      )
      expect(account.goCardless!.importedTill).toBeInstanceOf(
        Temporal.PlainDate,
      )
    })
  })
})
