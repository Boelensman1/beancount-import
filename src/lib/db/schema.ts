import { z } from 'zod'

/**
 * Config schema - contains application configuration
 */
export const ConfigSchema = z.object({
  accounts: z.array(
    z.object({
      id: z.uuid({ version: 'v4' }), // UUID
      name: z.string(),
      importerCommand: z.string(),
    }),
  ),
})

/**
 * Batch import schema - groups multiple account imports together
 */
export const BatchImportSchema = z.object({
  id: z.uuid({ version: 'v4' }), // UUID
  timestamp: z.string(), // ISO 8601 timestamp
  importIds: z.array(z.uuid({ version: 'v4' })), // UUIDs of ImportResults in this batch
  accountIds: z.array(z.uuid({ version: 'v4' })), // UUIDs of accounts in this batch
})

/**
 * Import result schema - stores parsed beancount import results
 */
export const ImportResultSchema = z.object({
  id: z.uuid({ version: 'v4' }), // UUID
  accountId: z.uuid({ version: 'v4' }), // UUID reference to account
  batchId: z.uuid({ version: 'v4' }), // UUID reference to batch
  timestamp: z.string(), // ISO 8601 timestamp
  parseResult: z.string(), // ParseResult JSON from beancount
  transactionCount: z.number(), // Number of transaction entries
})

/**
 * Database schema - root structure of the database
 */
export const DatabaseSchema = z.object({
  config: ConfigSchema,
  imports: z.array(ImportResultSchema).default([]),
  batches: z.array(BatchImportSchema).default([]),
})
