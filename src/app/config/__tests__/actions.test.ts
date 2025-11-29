import { describe, it, expect, beforeEach, vi } from 'vitest'
import { updateConfig } from '../actions'
import { getDb } from '@/lib/db/db'
import { createMockDb, setupDbMock } from '@/test/mocks/db'
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
      formData.set('defaults', JSON.stringify({}))
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
          defaults: {},
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
      formData.set('defaults', JSON.stringify({}))
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
      formData.set('defaults', JSON.stringify({}))
      // No goCardless field

      const result = await updateConfig(null, formData)

      expect(result.success).toBe(true)
      expect(mockDb.data.config.goCardless).toBeUndefined()
    })

    it('should remove GoCardless credentials when not provided', async () => {
      const mockDb = createMockDb({
        config: {
          defaults: {},
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
      formData.set('defaults', JSON.stringify({}))
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
      formData.set('defaults', JSON.stringify({}))
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
      formData.set('defaults', JSON.stringify({}))
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
            importerCommand: 'echo test',
            defaultOutputFile: 'test.beancount',
          },
        ]),
      )
      formData.set('defaults', JSON.stringify({ postProcessCommand: 'echo' }))
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
})
