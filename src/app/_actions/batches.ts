'use server'

import { randomUUID } from 'node:crypto'
import { getDb } from '@/lib/db/db'
import type { ImportResult, BatchImport } from '@/lib/db/types'
import { groupTransactionsByOutputFile } from '@/lib/beancount/transactionGrouping'
import {
  fileExists,
  backupFile,
  restoreBackup,
  deleteBackup,
  createTempFile,
  commitTempFile,
  deleteTempFile,
} from '@/lib/beancount/fileOperations'
import { mergeTransactionsIntoFile } from '@/lib/beancount/fileMerge'
import { executePostProcessCommand } from '@/lib/beancount/postProcess'

export async function deleteBatch(id: string): Promise<boolean> {
  const db = await getDb()

  if (!db.data.batches) {
    return false
  }

  // Find the batch to get its import IDs
  const batch = db.data.batches.find((b) => b.id === id)
  if (!batch) {
    return false
  }

  // Delete all imports in the batch
  if (db.data.imports) {
    db.data.imports = db.data.imports.filter(
      (imp) => !batch.importIds.includes(imp.id),
    )
  }

  // Delete the batch itself
  const initialLength = db.data.batches.length
  db.data.batches = db.data.batches.filter((b) => b.id !== id)

  if (db.data.batches.length < initialLength) {
    await db.write()
    return true
  }

  return false
}

export async function createBatch(accountIds: string[]): Promise<string> {
  const db = await getDb()

  const batchId = randomUUID()
  const batch: BatchImport = {
    id: batchId,
    timestamp: new Date().toISOString(),
    importIds: [],
    accountIds,
    completedCount: 0,
  }

  if (!db.data.batches) {
    db.data.batches = []
  }
  db.data.batches.push(batch)
  await db.write()

  return batchId
}

export async function getBatchResult(
  batchId: string,
): Promise<{ batch: BatchImport; imports: ImportResult[] } | null> {
  const db = await getDb()

  const dbJSON = db.toJSON()

  const batch = dbJSON.batches?.find((b) => b.id === batchId)
  if (!batch) {
    return null
  }

  const imports = (dbJSON.imports ?? []).filter((imp) =>
    batch.importIds.includes(imp.id),
  )

  // Sort imports by account order from config
  const accountOrder = dbJSON.config.accounts.map((acc) => acc.id)
  const sortedImports = imports.sort((a, b) => {
    const indexA = accountOrder.indexOf(a.accountId)
    const indexB = accountOrder.indexOf(b.accountId)
    return indexA - indexB
  })

  return { batch, imports: sortedImports }
}

export async function getBatches(): Promise<BatchImport[]> {
  const db = await getDb()

  // Return all batches sorted by timestamp (newest first)
  return (db.toJSON().batches ?? []).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )
}

export async function checkAndDeleteEmptyBatch(batchId: string): Promise<void> {
  const db = await getDb()

  const batch = db.data.batches?.find((b) => b.id === batchId)
  if (!batch) return

  // Increment completed count
  batch.completedCount++

  // Check if all imports are done and all failed
  if (
    batch.completedCount >= batch.accountIds.length &&
    batch.importIds.length === 0
  ) {
    // All imports completed, none succeeded - delete the batch
    db.data.batches = db.data.batches?.filter((b) => b.id !== batchId) ?? []
  }

  await db.write()
}

/**
 * Confirm import by writing transactions to beancount files
 */
export async function confirmImport(batchId: string): Promise<{
  success: boolean
  error?: string
  filesModified?: string[]
  postProcessResults?: Record<string, { success: boolean; output: string }>
}> {
  const backupMap: Record<string, string> = {}
  const tempFileMap: Record<string, string> = {}

  try {
    // Step 1: Fetch and validate
    const db = await getDb()
    const batch = db.data.batches?.find((b) => b.id === batchId)
    if (!batch) {
      return { success: false, error: 'Batch not found' }
    }

    const batchImports = db.data.imports?.filter((imp) =>
      batch.importIds.includes(imp.id),
    )
    if (!batchImports || batchImports.length === 0) {
      return { success: false, error: 'No imports found for batch' }
    }

    const accounts = db.data.config.accounts
    const postProcessCommand = db.data.config.defaults?.postProcessCommand

    // Step 2: Group transactions
    const groups = groupTransactionsByOutputFile(batchImports, accounts)
    if (groups.length === 0) {
      return { success: false, error: 'No transactions to import' }
    }

    // Step 3: Create backups (only if files exist)
    for (const group of groups) {
      try {
        if (await fileExists(group.outputFile)) {
          const backupPath = await backupFile(group.outputFile)
          backupMap[group.outputFile] = backupPath
        }
      } catch (error) {
        // Rollback: restore any backups created so far, then delete
        for (const [originalPath, backupPath] of Object.entries(backupMap)) {
          await restoreBackup(originalPath, backupPath).catch((e) =>
            console.error('Failed to restore backup:', e),
          )
        }
        for (const backupPath of Object.values(backupMap)) {
          await deleteBackup(backupPath).catch((e) =>
            console.error('Failed to delete backup:', e),
          )
        }
        return {
          success: false,
          error: `Backup failed: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    }

    // Step 4: Write to temp files (original files untouched)
    try {
      for (const group of groups) {
        const content = await mergeTransactionsIntoFile(
          group.outputFile,
          group.transactions,
        )
        const tempPath = await createTempFile(content, group.outputFile)
        tempFileMap[group.outputFile] = tempPath
      }
    } catch (error) {
      // Cleanup temp files and backups
      for (const tempPath of Object.values(tempFileMap)) {
        await deleteTempFile(tempPath).catch((e) =>
          console.error('Failed to delete temp file:', e),
        )
      }
      for (const backupPath of Object.values(backupMap)) {
        await deleteBackup(backupPath).catch((e) =>
          console.error('Failed to delete backup:', e),
        )
      }
      return {
        success: false,
        error: `Merge failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }

    // Step 5: Execute post-process commands on temp files
    const postProcessResults: Record<
      string,
      { success: boolean; output: string }
    > = {}

    if (postProcessCommand) {
      try {
        for (const group of groups) {
          const tempPath = tempFileMap[group.outputFile]
          const result = await executePostProcessCommand(
            postProcessCommand,
            tempPath,
            group.accountName,
          )
          postProcessResults[group.outputFile] = {
            success: result.success,
            output:
              result.output + (result.error ? `\nError: ${result.error}` : ''),
          }

          if (!result.success) {
            throw new Error(
              `Post-process failed for ${group.outputFile}: ${result.error}`,
            )
          }
        }
      } catch (error) {
        // Cleanup: delete temp files and backups, originals are untouched
        for (const tempPath of Object.values(tempFileMap)) {
          await deleteTempFile(tempPath).catch((e) =>
            console.error('Failed to delete temp file:', e),
          )
        }
        for (const backupPath of Object.values(backupMap)) {
          await deleteBackup(backupPath).catch((e) =>
            console.error('Failed to delete backup:', e),
          )
        }
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }

    // Step 6: Commit temp files to final locations
    const modifiedFiles: string[] = []
    try {
      for (const [finalPath, tempPath] of Object.entries(tempFileMap)) {
        await commitTempFile(tempPath, finalPath)
        modifiedFiles.push(finalPath)
      }
    } catch (error) {
      // Critical failure during commit - restore from backups
      for (const [originalPath, backupPath] of Object.entries(backupMap)) {
        await restoreBackup(originalPath, backupPath).catch((e) =>
          console.error('Failed to restore backup:', e),
        )
      }
      for (const tempPath of Object.values(tempFileMap)) {
        await deleteTempFile(tempPath).catch((e) =>
          console.error('Failed to delete temp file:', e),
        )
      }
      for (const backupPath of Object.values(backupMap)) {
        await deleteBackup(backupPath).catch((e) =>
          console.error('Failed to delete backup:', e),
        )
      }
      return {
        success: false,
        error: `Commit failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }

    // Step 7: Clean up and finalize
    for (const backupPath of Object.values(backupMap)) {
      await deleteBackup(backupPath).catch((e) =>
        console.error('Backup cleanup failed:', e),
      )
    }

    // Remove batch and imports from database
    db.data.batches = (db.data.batches ?? []).filter((b) => b.id !== batchId)
    db.data.imports = (db.data.imports ?? []).filter(
      (i) => !batch.importIds.includes(i.id),
    )
    await db.write()

    return {
      success: true,
      filesModified: modifiedFiles,
      postProcessResults,
    }
  } catch (error) {
    // Unexpected error - try to clean up
    for (const tempPath of Object.values(tempFileMap)) {
      await deleteTempFile(tempPath).catch((e) =>
        console.error('Failed to delete temp file:', e),
      )
    }
    for (const backupPath of Object.values(backupMap)) {
      await deleteBackup(backupPath).catch((e) =>
        console.error('Failed to delete backup:', e),
      )
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
