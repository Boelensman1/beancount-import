import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import { join } from 'path'
import { Database } from './types'
import { defaultData } from './defaultData'

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
  }

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
