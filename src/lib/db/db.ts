import { join } from 'path'
import { ConfigSchema, DatabaseSchema } from './schema'
import { Db } from './dbClass'

let dbFilePath: string | null = process.env.DB_FILEPATH ?? null

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
 * Get the database instance
 * Always reads fresh data from disk to avoid stale data issues
 *
 * @returns Promise that resolves to the database instance
 */
export async function getDb(): Promise<Db> {
  const file = dbFilePath ?? join(process.cwd(), 'data', 'db.json')
  return Db.createFromFile(file)
}

/**
 * Reset the database file path (useful for testing)
 */
export function resetDb(): void {
  dbFilePath = null
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
