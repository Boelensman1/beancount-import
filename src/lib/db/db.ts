import { join } from 'path'
import { ConfigSchema, DatabaseSchema } from './schema'
import { Db } from './dbClass'

let db: Db | Promise<Db> | null = null
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
export async function getDb(): Promise<Db> {
  if (db) {
    return db
  }

  // done like this so that we immediately set db and we don't get
  // any race conditions
  db = new Promise<Db>(async (resolve) => {
    // Database file path: ./data/db.json from project root (or custom path if set)
    const file = dbFilePath ?? join(process.cwd(), 'data', 'db.json')
    db = await Db.createFromFile(file)

    resolve(db)
  })

  return db
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
