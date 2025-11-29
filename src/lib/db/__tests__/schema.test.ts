import { describe, it, expect } from 'vitest'
import { Temporal } from '@js-temporal/polyfill'
import {
  TemporalPlainDateSchema,
  TemporalInstantSchema,
  GoCardlessAccountConfigSchema,
  ConfigSchema,
} from '../schema'
import crypto from 'crypto'

describe('Temporal Schema Transforms', () => {
  describe('TemporalPlainDateSchema', () => {
    it('should parse valid ISO date string to PlainDate', () => {
      const result = TemporalPlainDateSchema.parse('2024-11-29')
      expect(result).toBeInstanceOf(Temporal.PlainDate)
      expect(result.toString()).toBe('2024-11-29')
    })

    it('should reject invalid date format', () => {
      expect(() => TemporalPlainDateSchema.parse('invalid')).toThrow()
    })

    it('should reject invalid date values', () => {
      expect(() => TemporalPlainDateSchema.parse('2024-13-45')).toThrow()
    })
  })

  describe('TemporalInstantSchema', () => {
    it('should parse valid ISO 8601 timestamp to Instant', () => {
      const result = TemporalInstantSchema.parse('2024-11-29T10:30:00Z')
      expect(result).toBeInstanceOf(Temporal.Instant)
      expect(result.toString()).toBe('2024-11-29T10:30:00Z')
    })

    it('should reject invalid timestamp format', () => {
      expect(() => TemporalInstantSchema.parse('invalid')).toThrow()
    })
  })

  describe('GoCardlessAccountConfigSchema', () => {
    it('should parse valid GoCardless config', () => {
      const validConfig = {
        countryCode: 'GB',
        bankId: 'SANDBOXFINANCE_SFIN0000',
        reqRef: 'req-ref-123',
        accounts: [crypto.randomUUID(), crypto.randomUUID()],
        importedTill: '2024-11-01',
        endUserAgreementValidTill: '2025-11-01T00:00:00Z',
      }

      const result = GoCardlessAccountConfigSchema.parse(validConfig)

      expect(result.bankId).toBe('SANDBOXFINANCE_SFIN0000')
      expect(result.countryCode).toBe('GB')
      expect(result.importedTill).toBeInstanceOf(Temporal.PlainDate)
      expect(result.endUserAgreementValidTill).toBeInstanceOf(Temporal.Instant)
    })

    it('should reject missing required fields', () => {
      const invalidConfig = { bankId: 'SANDBOXFINANCE_SFIN0000' }
      expect(() => GoCardlessAccountConfigSchema.parse(invalidConfig)).toThrow()
    })
  })

  describe('ConfigSchema with GoCardless accounts', () => {
    it('should parse config with accounts including GoCardless config', () => {
      const validConfig = {
        defaults: {},
        accounts: [
          {
            id: crypto.randomUUID(),
            name: 'Test Account',
            importerCommand: 'echo test',
            defaultOutputFile: 'test.beancount',
            rules: [],
            goCardless: {
              countryCode: 'GB',
              bankId: 'SANDBOXFINANCE_SFIN0000',
              reqRef: 'req-ref-123',
              accounts: [crypto.randomUUID()],
              importedTill: '2024-11-01',
              endUserAgreementValidTill: '2025-11-01T00:00:00Z',
            },
          },
        ],
      }

      const result = ConfigSchema.parse(validConfig)
      expect(result.accounts[0].goCardless?.importedTill).toBeInstanceOf(
        Temporal.PlainDate,
      )
    })

    it('should allow account without goCardless config (optional)', () => {
      const validConfig = {
        defaults: {},
        accounts: [
          {
            id: crypto.randomUUID(),
            name: 'Test Account',
            importerCommand: 'echo test',
            defaultOutputFile: 'test.beancount',
            rules: [],
          },
        ],
      }
      const result = ConfigSchema.parse(validConfig)
      expect(result.accounts[0].goCardless).toBeUndefined()
    })
  })

  describe('ConfigSchema with GoCardless credentials', () => {
    it('should parse config with GoCardless credentials', () => {
      const validConfig = {
        defaults: {},
        goCardless: {
          secretId: 'test-secret-id',
          secretKey: 'test-secret-key',
        },
        accounts: [
          {
            id: crypto.randomUUID(),
            name: 'Test Account',
            importerCommand: 'echo test',
            defaultOutputFile: 'test.beancount',
            rules: [],
          },
        ],
      }

      const result = ConfigSchema.parse(validConfig)
      expect(result.goCardless).toEqual({
        secretId: 'test-secret-id',
        secretKey: 'test-secret-key',
      })
    })

    it('should allow config without GoCardless credentials (optional)', () => {
      const validConfig = {
        defaults: {},
        accounts: [
          {
            id: crypto.randomUUID(),
            name: 'Test Account',
            importerCommand: 'echo test',
            defaultOutputFile: 'test.beancount',
            rules: [],
          },
        ],
      }

      const result = ConfigSchema.parse(validConfig)
      expect(result.goCardless).toBeUndefined()
    })

    it('should reject GoCardless config with missing secretId', () => {
      const invalidConfig = {
        defaults: {},
        goCardless: {
          secretKey: 'test-secret-key',
        },
        accounts: [],
      }

      expect(() => ConfigSchema.parse(invalidConfig)).toThrow()
    })

    it('should reject GoCardless config with missing secretKey', () => {
      const invalidConfig = {
        defaults: {},
        goCardless: {
          secretId: 'test-secret-id',
        },
        accounts: [],
      }

      expect(() => ConfigSchema.parse(invalidConfig)).toThrow()
    })
  })
})
