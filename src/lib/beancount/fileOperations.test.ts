import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  readBeancountFile,
  createTempFile,
  commitTempFile,
  backupFile,
  restoreBackup,
  deleteTempFile,
  deleteBackup,
  fileExists,
  FileOperationError,
} from './fileOperations'

describe('fileOperations', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'beancount-test-'))
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('readBeancountFile', () => {
    it('should read file content successfully', async () => {
      const filePath = path.join(testDir, 'test.beancount')
      const content = '2024-01-01 * "Test transaction"'
      await fs.writeFile(filePath, content)

      const result = await readBeancountFile(filePath)
      expect(result).toBe(content)
    })

    it('should throw FileOperationError when file does not exist', async () => {
      const filePath = path.join(testDir, 'nonexistent.beancount')

      await expect(readBeancountFile(filePath)).rejects.toThrow(
        FileOperationError,
      )
      await expect(readBeancountFile(filePath)).rejects.toThrow(
        /File not found/,
      )
    })
  })

  describe('createTempFile', () => {
    it('should create temp file with unique name', async () => {
      const basePath = path.join(testDir, 'output.beancount')
      const content = '2024-01-01 * "Test"'

      const tempPath = await createTempFile(content, basePath)

      expect(tempPath).toMatch(/\.tmp\.\d+\.[a-f0-9]+$/)
      const tempContent = await fs.readFile(tempPath, 'utf-8')
      expect(tempContent).toBe(content)
    })

    it('should create multiple temp files with unique names', async () => {
      const basePath = path.join(testDir, 'output.beancount')
      const content = 'test content'

      const tempPath1 = await createTempFile(content, basePath)
      const tempPath2 = await createTempFile(content, basePath)

      expect(tempPath1).not.toBe(tempPath2)
    })

    it('should throw error when parent directory does not exist', async () => {
      const basePath = path.join(testDir, 'nonexistent', 'output.beancount')
      const content = 'test'

      await expect(createTempFile(content, basePath)).rejects.toThrow(
        FileOperationError,
      )
      await expect(createTempFile(content, basePath)).rejects.toThrow(
        /Parent directory does not exist/,
      )
    })
  })

  describe('commitTempFile', () => {
    it('should rename temp file to final location', async () => {
      const tempPath = path.join(testDir, 'temp.tmp')
      const finalPath = path.join(testDir, 'final.beancount')
      const content = 'test content'

      await fs.writeFile(tempPath, content)
      await commitTempFile(tempPath, finalPath)

      const finalContent = await fs.readFile(finalPath, 'utf-8')
      expect(finalContent).toBe(content)

      await expect(fs.access(tempPath)).rejects.toThrow()
    })

    it('should overwrite existing file at final location', async () => {
      const tempPath = path.join(testDir, 'temp.tmp')
      const finalPath = path.join(testDir, 'final.beancount')
      const oldContent = 'old content'
      const newContent = 'new content'

      await fs.writeFile(finalPath, oldContent)
      await fs.writeFile(tempPath, newContent)

      await commitTempFile(tempPath, finalPath)

      const finalContent = await fs.readFile(finalPath, 'utf-8')
      expect(finalContent).toBe(newContent)
    })
  })

  describe('backupFile', () => {
    it('should create backup with timestamped name', async () => {
      const filePath = path.join(testDir, 'original.beancount')
      const content = 'original content'
      await fs.writeFile(filePath, content)

      const backupPath = await backupFile(filePath)

      expect(backupPath).toMatch(/\.backup\.\d+\.[a-f0-9]+$/)
      const backupContent = await fs.readFile(backupPath, 'utf-8')
      expect(backupContent).toBe(content)
    })

    it('should throw error when file does not exist', async () => {
      const filePath = path.join(testDir, 'nonexistent.beancount')

      await expect(backupFile(filePath)).rejects.toThrow(FileOperationError)
      await expect(backupFile(filePath)).rejects.toThrow(/File not found/)
    })
  })

  describe('restoreBackup', () => {
    it('should restore file from backup', async () => {
      const originalPath = path.join(testDir, 'original.beancount')
      const backupPath = path.join(testDir, 'backup.beancount')
      const originalContent = 'original'
      const backupContent = 'backup'

      await fs.writeFile(originalPath, originalContent)
      await fs.writeFile(backupPath, backupContent)

      await restoreBackup(originalPath, backupPath)

      const restoredContent = await fs.readFile(originalPath, 'utf-8')
      expect(restoredContent).toBe(backupContent)
    })
  })

  describe('deleteTempFile', () => {
    it('should delete temp file', async () => {
      const tempPath = path.join(testDir, 'temp.tmp')
      await fs.writeFile(tempPath, 'temp content')

      await deleteTempFile(tempPath)

      await expect(fs.access(tempPath)).rejects.toThrow()
    })

    it('should not throw when file does not exist', async () => {
      const tempPath = path.join(testDir, 'nonexistent.tmp')

      await expect(deleteTempFile(tempPath)).resolves.toBeUndefined()
    })
  })

  describe('deleteBackup', () => {
    it('should delete backup file', async () => {
      const backupPath = path.join(testDir, 'backup.beancount')
      await fs.writeFile(backupPath, 'backup content')

      await deleteBackup(backupPath)

      await expect(fs.access(backupPath)).rejects.toThrow()
    })

    it('should not throw when file does not exist', async () => {
      const backupPath = path.join(testDir, 'nonexistent.backup')

      await expect(deleteBackup(backupPath)).resolves.toBeUndefined()
    })
  })

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const filePath = path.join(testDir, 'exists.beancount')
      await fs.writeFile(filePath, 'content')

      const exists = await fileExists(filePath)
      expect(exists).toBe(true)
    })

    it('should return false for non-existing file', async () => {
      const filePath = path.join(testDir, 'nonexistent.beancount')

      const exists = await fileExists(filePath)
      expect(exists).toBe(false)
    })
  })
})
