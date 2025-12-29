import { join } from 'path'
import { ConfigSchema, DatabaseSchema } from './schema'
import { Db } from './dbClass'

let dbFilePath: string | null = process.env.DB_FILEPATH ?? null

// Use globalThis to survive hot reloading in development (Next.js pattern)
const globalForDb = globalThis as unknown as {
  dbInstance: Db | undefined
  dbInstancePromise: Promise<Db> | undefined
}

/**
 * Set the database file path
 * Must be called before getDb() to take effect
 *
 * @param filePath - Absolute path to the database file
 */
export function setDbFilePath(filePath: string): void {
  dbFilePath = filePath
}

/**
 * Get the database instance (singleton)
 * Returns a cached instance to ensure all writes go through the same
 * lowdb/steno Writer, which has built-in queuing to prevent race conditions.
 *
 * @returns Promise that resolves to the database instance
 */
export async function getDb(): Promise<Db> {
  // Return cached instance if available
  if (globalForDb.dbInstance) return globalForDb.dbInstance

  // Handle concurrent getDb() calls during initialization
  if (globalForDb.dbInstancePromise) return globalForDb.dbInstancePromise

  const file = dbFilePath ?? join(process.cwd(), 'data', 'db.json')
  globalForDb.dbInstancePromise = Db.createFromFile(file)
  globalForDb.dbInstance = await globalForDb.dbInstancePromise
  globalForDb.dbInstancePromise = undefined

  return globalForDb.dbInstance
}

/**
 * Reset the database instance and file path (useful for testing)
 */
export function resetDb(): void {
  dbFilePath = null
  globalForDb.dbInstance = undefined
  globalForDb.dbInstancePromise = undefined
}

export function deserializeDb(data: unknown) {
  const parseResult = DatabaseSchema.safeParse(data)
  if (parseResult.success) {
    return parseResult.data
  } else {
    throw new Error(
      `Failed to deserialize database: ${parseResult.error.message}`,
    )
  }
}

export function deserializeConfig(data: unknown) {
  const parseResult = ConfigSchema.safeParse(data)
  if (parseResult.success) {
    return parseResult.data
  } else {
    throw new Error(
      `Failed to deserialize config: ${parseResult.error.message}`,
    )
  }
}
