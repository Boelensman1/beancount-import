import { z } from 'zod'
import {
  ConfigSchema,
  DatabaseSchema,
  ImportResultSchema,
  BatchImportSchema,
} from './schema'

/**
 * TypeScript type for Account object
 */
export type Account = {
  id: string
  name: string
  importerCommand: string
}

/**
 * TypeScript type for Config object
 * Inferred from Zod schema for type safety
 */
export type Config = z.infer<typeof ConfigSchema>

/**
 * TypeScript type for BatchImport object
 * Inferred from Zod schema for type safety
 */
export type BatchImport = z.infer<typeof BatchImportSchema>

/**
 * TypeScript type for ImportResult object
 * Inferred from Zod schema for type safety
 */
export type ImportResult = z.infer<typeof ImportResultSchema>

/**
 * TypeScript type for the entire Database
 * Inferred from Zod schema for type safety
 */
export type Database = z.infer<typeof DatabaseSchema>
