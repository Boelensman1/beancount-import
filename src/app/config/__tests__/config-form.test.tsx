import { describe, it, expect } from 'vitest'
import { Temporal } from '@js-temporal/polyfill'
import { ConfigSchema } from '@/lib/db/schema'
import { serializeConfig } from '@/lib/db/serialization'
import { createMockGoCardlessConfig } from '@/test/test-utils'
import type { Config } from '@/lib/db/types'

describe('ConfigForm Client-Side Deserialization', () => {
  describe('ConfigSchema parsing of serialized data', () => {
    it('should parse serialized config and restore Temporal objects', () => {
      // Arrange: Create a config with Temporal objects
      const accountId = crypto.randomUUID()
      const goCardlessConfig = createMockGoCardlessConfig()

      const config: Config = {
        defaults: {},
        accounts: [
          {
            id: accountId,
            name: 'Test Account',
            importerCommand: 'echo test',
            defaultOutputFile: 'test.beancount',
            rules: [],
            goCardless: goCardlessConfig,
          },
        ],
      }

      // Act: Serialize (server) then parse (client)
      const serialized = serializeConfig(config)
      const parsed = ConfigSchema.parse(serialized)

      // Assert: Temporal objects should be restored
      expect(parsed.accounts[0].goCardless).toBeDefined()
      expect(
        parsed.accounts[0].goCardless!.endUserAgreementValidTill,
      ).toBeInstanceOf(Temporal.Instant)
      expect(parsed.accounts[0].goCardless!.importedTill).toBeInstanceOf(
        Temporal.PlainDate,
      )
    })

    it('should allow Temporal methods to be called on parsed objects', () => {
      // Arrange
      const accountId = crypto.randomUUID()
      const goCardlessConfig = createMockGoCardlessConfig()

      const config: Config = {
        defaults: {},
        accounts: [
          {
            id: accountId,
            name: 'Test Account',
            importerCommand: 'echo test',
            defaultOutputFile: 'test.beancount',
            rules: [],
            goCardless: goCardlessConfig,
          },
        ],
      }

      // Act: Serialize then parse
      const serialized = serializeConfig(config)
      const parsed = ConfigSchema.parse(serialized)

      // Assert: Should be able to call Temporal methods
      expect(() => {
        const validUntil = parsed.accounts[0]
          .goCardless!.endUserAgreementValidTill.toZonedDateTimeISO('UTC')
          .toPlainDate()
          .toString()
        expect(typeof validUntil).toBe('string')
      }).not.toThrow()
    })

    it('should correctly determine connection status after parsing', () => {
      const accountId = crypto.randomUUID()

      // Test expired connection
      const expiredConfig = createMockGoCardlessConfig({
        endUserAgreementValidTill: Temporal.Instant.from(
          '2020-01-01T00:00:00Z',
        ),
      })

      const config: Config = {
        defaults: {},
        accounts: [
          {
            id: accountId,
            name: 'Test Account',
            importerCommand: 'echo test',
            defaultOutputFile: 'test.beancount',
            rules: [],
            goCardless: expiredConfig,
          },
        ],
      }

      const serialized = serializeConfig(config)
      const parsed = ConfigSchema.parse(serialized)

      // Verify we can check expiration status
      const now = Temporal.Now.instant()
      const isExpired =
        Temporal.Instant.compare(
          parsed.accounts[0].goCardless!.endUserAgreementValidTill,
          now,
        ) < 0

      expect(isExpired).toBe(true)
    })

    it('should handle accounts without goCardless config', () => {
      const accountId = crypto.randomUUID()

      const config: Config = {
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
      }

      const serialized = serializeConfig(config)
      const parsed = ConfigSchema.parse(serialized)

      expect(parsed.accounts[0].goCardless).toBeUndefined()
    })

    it('should preserve all config fields during serialization round-trip', () => {
      const accountId = crypto.randomUUID()
      const goCardlessConfig = createMockGoCardlessConfig()

      const config: Config = {
        defaults: { postProcessCommand: 'echo done' },
        goCardless: {
          secretId: 'test-secret-id',
          secretKey: 'test-secret-key',
        },
        accounts: [
          {
            id: accountId,
            name: 'Test Account',
            importerCommand: 'echo test',
            defaultOutputFile: 'test.beancount',
            rules: [],
            goCardless: goCardlessConfig,
          },
        ],
      }

      const serialized = serializeConfig(config)
      const parsed = ConfigSchema.parse(serialized)

      // Verify all fields are preserved
      expect(parsed.defaults.postProcessCommand).toBe('echo done')
      expect(parsed.goCardless).toEqual({
        secretId: 'test-secret-id',
        secretKey: 'test-secret-key',
      })
      expect(parsed.accounts[0].name).toBe('Test Account')
      expect(parsed.accounts[0].goCardless!.countryCode).toBe(
        goCardlessConfig.countryCode,
      )
    })
  })
})
