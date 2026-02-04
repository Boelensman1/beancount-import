import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, rmSync, mkdtempSync } from 'fs'
import fs from 'node:fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

// Unmock the db module since we're testing the real implementation
vi.unmock('@/lib/db/db')

// Import after unmocking
import { getDb, setDbFilePath, resetDb } from '../db'

let TEST_DB_DIR: string
let TEST_DB_FILE: string

describe('Db concurrent writes', () => {
  beforeEach(() => {
    // Create a unique temporary directory for each test
    TEST_DB_DIR = mkdtempSync(join(tmpdir(), 'db-concurrent-test-'))
    TEST_DB_FILE = join(TEST_DB_DIR, 'db.json')

    // Reset and configure db to use temp directory
    resetDb()
    setDbFilePath(TEST_DB_FILE)
  })

  afterEach(() => {
    // Clean up after each test
    resetDb()
    if (existsSync(TEST_DB_DIR)) {
      rmSync(TEST_DB_DIR, { recursive: true })
    }
  })

  it('should handle concurrent writes without ENOENT errors', async () => {
    // Perform multiple concurrent writes
    // With the singleton pattern, all writes go through the same steno Writer
    // which has built-in queuing, so they should all succeed
    const writePromises: Promise<void>[] = []
    for (let i = 0; i < 10; i++) {
      // Each iteration: get db, modify, write
      const writeOp = (async () => {
        const db = await getDb()
        // Make a small modification
        db.data.imports ??= []
        db.data.imports.push({
          id: `import-${i}`,
          accountId: `account-${i}`,
          timestamp: new Date().toISOString(),
          transactions: [],
          transactionCount: 0,
          csvPath: `/tmp/test-${i}.csv`,
        })
        await db.write()
      })()
      writePromises.push(writeOp)
    }

    // All writes should complete without ENOENT errors
    await expect(Promise.all(writePromises)).resolves.not.toThrow()

    // Verify the db file exists and is valid JSON
    const content = await fs.readFile(TEST_DB_FILE, 'utf-8')
    const parsed = JSON.parse(content)
    expect(parsed).toBeDefined()
  })

  it('should return the same instance for all getDb calls (singleton)', async () => {
    // Get db instances concurrently
    const [db1, db2, db3] = await Promise.all([getDb(), getDb(), getDb()])

    // With the singleton pattern, all should be the same instance
    // This ensures all writes go through the same steno Writer
    expect(db1).toBe(db2)
    expect(db2).toBe(db3)
  })
})
