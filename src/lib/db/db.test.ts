import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, rmSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import { getDb, resetDb, setDbFilePath } from './db'

// Unmock the db module for this test file since we're testing the real implementation
vi.unmock('./db.ts')

let TEST_DB_DIR: string
let TEST_DB_FILE: string

describe('Database Operations', () => {
  beforeEach(() => {
    // Create a unique temporary directory for each test
    TEST_DB_DIR = mkdtempSync(join(tmpdir(), 'beancount-test-'))
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

  it('should initialize database with default data', async () => {
    const db = await getDb()

    expect(db.data).toBeDefined()
    expect(db.data.config).toBeDefined()
    expect(db.data.config.accounts).toEqual([])
  })

  it('should create database file after write', async () => {
    const db = await getDb()

    // File is not created until write is called
    expect(existsSync(TEST_DB_FILE)).toBe(false)

    await db.write()

    // Now file should exist
    expect(existsSync(TEST_DB_FILE)).toBe(true)
  })

  it('should return the same instance on multiple calls', async () => {
    const db1 = await getDb()
    const db2 = await getDb()

    expect(db1).toBe(db2)
  })

  it('should persist changes to the database file', async () => {
    const db = await getDb()
    const accountId = crypto.randomUUID()

    // Update the config
    db.data.config = {
      defaults: {
        beangulpCommand: '',
        postProcessCommand: 'test-post-process-command',
      },
      accounts: [
        {
          id: accountId,
          name: 'Test Account',
          csvFilename: 'csv.csv',
          defaultOutputFile: '/path/to/output.beancount',
          rules: [],
        },
      ],
    }
    await db.write()

    // Reset and read again
    resetDb()
    setDbFilePath(TEST_DB_FILE)
    const newDb = await getDb()

    expect(newDb.data.config.defaults).toEqual({
      beangulpCommand: '',
      postProcessCommand: 'test-post-process-command',
    })
    expect(newDb.data.config.accounts).toEqual([
      {
        id: accountId,
        name: 'Test Account',
        csvFilename: 'csv.csv',
        defaultOutputFile: '/path/to/output.beancount',
        rules: [],
      },
    ])
  })

  it('should read existing database file', async () => {
    // Create a database with custom data
    const db1 = await getDb()
    const accountId = crypto.randomUUID()

    db1.data.config = {
      defaults: {
        beangulpCommand: '',
        postProcessCommand: 'custom-post-process',
      },
      accounts: [
        {
          id: accountId,
          name: 'Custom Account',
          csvFilename: 'csv.csv',
          defaultOutputFile: '/path/to/output.beancount',
          rules: [],
        },
      ],
    }
    await db1.write()

    // Reset and read again
    resetDb()
    setDbFilePath(TEST_DB_FILE)
    const db2 = await getDb()

    expect(db2.data.config.defaults).toEqual({
      beangulpCommand: '',
      postProcessCommand: 'custom-post-process',
    })
    expect(db2.data.config.accounts).toEqual([
      {
        id: accountId,
        name: 'Custom Account',
        csvFilename: 'csv.csv',
        defaultOutputFile: '/path/to/output.beancount',
        rules: [],
      },
    ])
  })

  it('should reset database instance', async () => {
    const db1 = await getDb()
    resetDb()
    setDbFilePath(TEST_DB_FILE)
    const db2 = await getDb()

    // After reset, we should get a new instance
    // (though they might be functionally equivalent)
    expect(db1).toBeDefined()
    expect(db2).toBeDefined()
  })

  it('should handle concurrent getDb calls correctly', async () => {
    const [db1, db2, db3] = await Promise.all([getDb(), getDb(), getDb()])

    expect(db1).toBe(db2)
    expect(db2).toBe(db3)
  })

  it('should handle missing defaults gracefully', async () => {
    const db = await getDb()
    const accountId = crypto.randomUUID()

    // Config with no defaults specified
    db.data.config = {
      defaults: {
        beangulpCommand: '',
      },
      accounts: [
        {
          id: accountId,
          name: 'Test Account',
          csvFilename: 'csv.csv',
          defaultOutputFile: '/path/to/output.beancount',
          rules: [],
        },
      ],
    }
    await db.write()

    resetDb()
    setDbFilePath(TEST_DB_FILE)
    const newDb = await getDb()

    expect(newDb.data.config.defaults).toEqual({
      beangulpCommand: '',
    })
    expect(newDb.data.config.accounts).toHaveLength(1)
  })
})
