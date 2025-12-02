import { describe, it, expect, beforeEach, vi } from 'vitest'
import { updateConfig, getSerializedConfig } from '../actions'
import { deserializeConfig, getDb } from '@/lib/db/db'
import { createMockDb, setupDbMock } from '@/test/mocks/db'
import { createMockGoCardlessConfig } from '@/test/test-utils'
import crypto from 'crypto'

describe('Config Actions', () => {
  beforeEach(() => {
    setupDbMock()
  })

  describe('updateConfig with GoCardless credentials', () => {
    it('should save GoCardless credentials when provided', async () => {
      const mockDb = createMockDb()
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const formData = new FormData()
      formData.set('accounts', JSON.stringify([]))
      formData.set('defaults', JSON.stringify({ beangulpCommand: '' }))
      formData.set(
        'goCardless',
        JSON.stringify({
          secretId: 'test-secret-id',
          secretKey: 'test-secret-key',
        }),
      )

      const result = await updateConfig(null, formData)

      expect(result.success).toBe(true)
      expect(result.message).toBe('Config updated successfully!')
      expect(mockDb.data.config.goCardless).toEqual({
        secretId: 'test-secret-id',
        secretKey: 'test-secret-key',
      })
    })

    it('should allow updating GoCardless credentials', async () => {
      const mockDb = createMockDb({
        config: {
          defaults: {
            beangulpCommand: '',
          },
          goCardless: {
            secretId: 'old-secret-id',
            secretKey: 'old-secret-key',
          },
          accounts: [],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      // Update credentials
      const formData = new FormData()
      formData.set('accounts', JSON.stringify([]))
      formData.set('defaults', JSON.stringify({ beangulpCommand: '' }))
      formData.set(
        'goCardless',
        JSON.stringify({
          secretId: 'new-secret-id',
          secretKey: 'new-secret-key',
        }),
      )

      const result = await updateConfig(null, formData)

      expect(result.success).toBe(true)
      expect(mockDb.data.config.goCardless).toEqual({
        secretId: 'new-secret-id',
        secretKey: 'new-secret-key',
      })
    })

    it('should allow config without GoCardless credentials', async () => {
      const mockDb = createMockDb()
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const formData = new FormData()
      formData.set('accounts', JSON.stringify([]))
      formData.set('defaults', JSON.stringify({ beangulpCommand: '' }))
      // No goCardless field

      const result = await updateConfig(null, formData)

      expect(result.success).toBe(true)
      expect(mockDb.data.config.goCardless).toBeUndefined()
    })

    it('should remove GoCardless credentials when not provided', async () => {
      const mockDb = createMockDb({
        config: {
          defaults: {
            beangulpCommand: '',
          },
          goCardless: {
            secretId: 'test-secret-id',
            secretKey: 'test-secret-key',
          },
          accounts: [],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      // Update without goCardless field
      const formData = new FormData()
      formData.set('accounts', JSON.stringify([]))
      formData.set('defaults', JSON.stringify({ beangulpCommand: '' }))
      // No goCardless field

      const result = await updateConfig(null, formData)

      expect(result.success).toBe(true)
      expect(mockDb.data.config.goCardless).toBeUndefined()
    })

    it('should reject invalid GoCardless data format', async () => {
      const mockDb = createMockDb()
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const formData = new FormData()
      formData.set('accounts', JSON.stringify([]))
      formData.set('defaults', JSON.stringify({ beangulpCommand: '' }))
      formData.set('beangulpCommand', JSON.stringify(''))
      formData.set('goCardless', 'invalid-json')

      const result = await updateConfig(null, formData)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Invalid GoCardless data format')
    })

    it('should validate GoCardless credentials schema', async () => {
      const mockDb = createMockDb()
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const formData = new FormData()
      formData.set('accounts', JSON.stringify([]))
      formData.set('defaults', JSON.stringify({ beangulpCommand: '' }))
      formData.set(
        'goCardless',
        JSON.stringify({
          secretId: 'test-id',
          // Missing secretKey
        }),
      )

      const result = await updateConfig(null, formData)

      expect(result.success).toBe(false)
      expect(result.message).toContain('Invalid input')
    })

    it('should save config with both GoCardless credentials and accounts', async () => {
      const mockDb = createMockDb()
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const accountId = crypto.randomUUID()
      const formData = new FormData()
      formData.set(
        'accounts',
        JSON.stringify([
          {
            id: accountId,
            name: 'Test Account',
            csvFilename: 'csv.csv',
            defaultOutputFile: 'test.beancount',
          },
        ]),
      )
      formData.set(
        'defaults',
        JSON.stringify({ postProcessCommand: 'echo', beangulpCommand: '' }),
      )
      formData.set(
        'goCardless',
        JSON.stringify({
          secretId: 'test-secret-id',
          secretKey: 'test-secret-key',
        }),
      )

      const result = await updateConfig(null, formData)

      expect(result.success).toBe(true)
      expect(mockDb.data.config.goCardless).toEqual({
        secretId: 'test-secret-id',
        secretKey: 'test-secret-key',
      })
      expect(mockDb.data.config.accounts).toHaveLength(1)
      expect(mockDb.data.config.accounts[0].name).toBe('Test Account')
      expect(mockDb.data.config.defaults.postProcessCommand).toBe('echo')
    })
  })

  describe('getConfig', () => {
    it('should return config with properly serialized Temporal objects', async () => {
      const accountId = crypto.randomUUID()
      const goCardlessConfig = createMockGoCardlessConfig()

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
              goCardless: goCardlessConfig,
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const config = await getSerializedConfig()

      expect(config.accounts).toHaveLength(1)
      expect(config.accounts[0].goCardless).toBeDefined()
    })

    it('should allow calling Temporal methods on deserialized objects', async () => {
      const accountId = crypto.randomUUID()
      const goCardlessConfig = createMockGoCardlessConfig()

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
              goCardless: goCardlessConfig,
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const serializedConfig = await getSerializedConfig()
      const config = deserializeConfig(serializedConfig)

      // Should be able to call Temporal methods without errors
      expect(() => {
        const validUntil = config.accounts[0]
          .goCardless!.endUserAgreementValidTill.toZonedDateTimeISO('UTC')
          .toPlainDate()
          .toString()
        expect(typeof validUntil).toBe('string')
      }).not.toThrow()
    })

    it('should handle accounts without goCardless config', async () => {
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
            },
          ],
        },
      })
      vi.mocked(getDb).mockResolvedValue(mockDb)

      const config = await getSerializedConfig()

      expect(config.accounts).toHaveLength(1)
      expect(config.accounts[0].goCardless).toBeUndefined()
    })
  })
})
