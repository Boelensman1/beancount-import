import { promises as fs } from 'fs'
import * as path from 'path'
import { randomBytes } from 'crypto'

export class FileOperationError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message)
    this.name = 'FileOperationError'
  }
}

export async function readBeancountFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new FileOperationError(
        `File not found: ${filePath}`,
        error as Error,
      )
    }
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      throw new FileOperationError(
        `Permission denied reading file: ${filePath}`,
        error as Error,
      )
    }
    throw new FileOperationError(
      `Failed to read file: ${filePath}`,
      error as Error,
    )
  }
}

export async function createTempFile(
  content: string,
  basePath: string,
): Promise<string> {
  const timestamp = Date.now()
  const randomId = randomBytes(8).toString('hex')
  const tempPath = `${basePath}.tmp.${timestamp}.${randomId}`

  const parentDir = path.dirname(tempPath)

  try {
    await fs.access(parentDir)
  } catch (error) {
    throw new FileOperationError(
      `Parent directory does not exist: ${parentDir}`,
      error as Error,
    )
  }

  try {
    await fs.writeFile(tempPath, content, 'utf-8')
    return tempPath
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      throw new FileOperationError(
        `Permission denied writing temp file: ${tempPath}`,
        error as Error,
      )
    }
    throw new FileOperationError(
      `Failed to create temp file: ${tempPath}`,
      error as Error,
    )
  }
}

export async function commitTempFile(
  tempPath: string,
  finalPath: string,
): Promise<void> {
  try {
    await fs.rename(tempPath, finalPath)
  } catch (error) {
    throw new FileOperationError(
      `Failed to commit temp file ${tempPath} to ${finalPath}`,
      error as Error,
    )
  }
}

export async function backupFile(filePath: string): Promise<string> {
  const timestamp = Date.now()
  const randomId = randomBytes(8).toString('hex')
  const backupPath = `${filePath}.backup.${timestamp}.${randomId}`

  try {
    await fs.copyFile(filePath, backupPath)
    return backupPath
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new FileOperationError(
        `File not found: ${filePath}`,
        error as Error,
      )
    }
    throw new FileOperationError(
      `Failed to create backup of ${filePath}`,
      error as Error,
    )
  }
}

export async function restoreBackup(
  originalPath: string,
  backupPath: string,
): Promise<void> {
  try {
    await fs.copyFile(backupPath, originalPath)
  } catch (error) {
    throw new FileOperationError(
      `Failed to restore backup ${backupPath} to ${originalPath}`,
      error as Error,
    )
  }
}

export async function deleteTempFile(tempPath: string): Promise<void> {
  try {
    await fs.unlink(tempPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Failed to delete temp file ${tempPath}:`, error)
    }
  }
}

export async function deleteBackup(backupPath: string): Promise<void> {
  try {
    await fs.unlink(backupPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`Failed to delete backup ${backupPath}:`, error)
    }
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}
