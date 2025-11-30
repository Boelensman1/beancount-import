import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import { join } from 'path'
import { Database } from './types'
import { defaultData } from './defaultData'
import { serializeDatabase } from './serialization'
import { ConfigSchema, DatabaseSchema } from './schema'

let db: Low<Database> | null = null
let dbFilePath: string | null = process.env.DB_FILEPATH ?? null

/**
 * Set the database file path
 * Must be called before getDb() to take effect
 *
 * @param filePath - Absolute path to the database file
 */
export function setDbFilePath(filePath: string): void {
  if (db) {
    throw new Error(
      'Database already initialized. Call resetDb() before changing the file path.',
    )
  }
  dbFilePath = filePath
}

/**
 * Get the database instance
 * Initializes the database on first call
 *
 * @returns Promise that resolves to the database instance
 */
export async function getDb(): Promise<Low<Database>> {
  if (db) {
    return db
  }

  // Database file path: ./data/db.json from project root (or custom path if set)
  const file = dbFilePath ?? join(process.cwd(), 'data', 'db.json')
  const adapter = new JSONFile<Database>(file)

  db = new Low<Database>(adapter, defaultData)

  // Read data from JSON file, this will set db.data to the content of the file
  await db.read()

  // If file doesn't exist or is empty, write default data
  if (db.data === null) {
    db.data = defaultData
    await db.write()
  } else {
    // Parse through DatabaseSchema to transform ISO strings to Temporal objects
    try {
      db.data = deserializeDb(db.data)
    } catch (err) {
      throw new Error(`Invalid database format: ${err}`)
    }
  }

  return db
}

/**
 * Write database with automatic serialization of Temporal types
 * Use this instead of db.write() to ensure proper serialization
 */
export async function writeDb(db: Low<Database>): Promise<void> {
  const serialized = serializeDatabase(db.data)
  db.data = serialized as Database
  await db.write()

  // Re-read and parse to restore Temporal objects
  await db.read()
  db.data = deserializeDb(db.data)
}

/**
 * Reset the database instance (useful for testing)
 * Also clears the custom file path if one was set
 */
export function resetDb(): void {
  db = null
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
