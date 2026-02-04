'use server'

import path from 'node:path'
import { Temporal } from '@js-temporal/polyfill'
import { getDb } from '@/lib/db/db'
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
import { mergeNodesIntoFile } from '@/lib/beancount/fileMerge'
import { executePostProcessCommand } from '@/lib/beancount/postProcess'

/**
 * Confirm import by writing transactions to beancount files
 */
export async function confirmImport(importId: string): Promise<{
  success: boolean
  error?: string
  filesModified?: string[]
  postProcessResults?: Record<string, { success: boolean; output: string }>
  csvPostProcessResults?: Record<
    string,
    { importId: string; success: boolean; output: string }
  >
}> {
  const backupMap: Record<string, string> = {}
  const tempFileMap: Record<string, string> = {}

  try {
    // Step 1: Fetch and validate
    const db = await getDb()
    const importResult = db.data.imports?.find((imp) => imp.id === importId)
    if (!importResult) {
      return { success: false, error: 'Import not found' }
    }

    const accounts = db.data.config.accounts
    const postProcessCommand = db.data.config.defaults?.postProcessCommand
    const csvPostProcessCommand = db.data.config.defaults?.csvPostProcessCommand

    // Step 2: Group transactions
    const groups = groupTransactionsByOutputFile([importResult], accounts)
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
        const content = await mergeNodesIntoFile(
          group.outputFile,
          group.nodes,
          {
            addBlankLines: true,
            delimiterComment: `*** ${[...new Set(group.csvFilePaths.map((csvFilePath) => path.basename(csvFilePath)))].join(', ')}`,
          },
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

    // Step 5A: Execute per-CSV post-process commands
    const csvPostProcessResults: Record<
      string,
      { importId: string; success: boolean; output: string }
    > = {}

    // Execute CSV post-process commands (per-account override or default)
    {
      try {
        const account = accounts.find((a) => a.id === importResult.accountId)
        if (account) {
          // Use per-account override if set, otherwise use default
          const accountCsvPostProcessCommand =
            account.csvPostProcessCommand ?? csvPostProcessCommand
          if (accountCsvPostProcessCommand) {
            const csvVariables: Record<string, string> = {
              csvPath: importResult.csvPath,
              csvDir: path.dirname(importResult.csvPath),
              account: account.name,
              importedFrom: importResult.importedFrom ?? '',
              importedTo: importResult.importedTo ?? '',
              outputFile: account.defaultOutputFile,
            }

            const result = await executePostProcessCommand(
              accountCsvPostProcessCommand,
              importResult.csvPath,
              account.name,
              csvVariables,
            )

            csvPostProcessResults[importResult.id] = {
              importId: importResult.id,
              success: result.success,
              output:
                result.output +
                (result.error ? `\nError: ${result.error}` : ''),
            }

            if (!result.success) {
              throw new Error(
                `CSV post-process failed for ${importResult.csvPath}: ${result.error}`,
              )
            }
          }
        }
      } catch (error) {
        // Rollback: delete temp files and backups
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

    // Step 5: Execute post-process commands on temp files
    const postProcessResults: Record<
      string,
      { success: boolean; output: string }
    > = {}

    // Execute post-process commands on temp files (per-account override or default)
    {
      try {
        for (const group of groups) {
          // Use per-account override if set, otherwise use default
          const account = accounts.find((a) => a.id === group.accountId)
          const accountPostProcessCommand =
            account?.postProcessCommand ?? postProcessCommand
          if (!accountPostProcessCommand) continue

          const tempPath = tempFileMap[group.outputFile]
          const result = await executePostProcessCommand(
            accountPostProcessCommand,
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

    // Update importedTill for the account based on the import's importedTo date
    if (importResult.importedTo) {
      const account = db.data.config.accounts.find(
        (acc) => acc.id === importResult.accountId,
      )
      if (account?.goCardless) {
        account.goCardless.importedTill = Temporal.PlainDate.from(
          importResult.importedTo,
        )
      }
    }

    // Remove import from database
    db.data.imports = (db.data.imports ?? []).filter((i) => i.id !== importId)
    await db.write()

    return {
      success: true,
      filesModified: modifiedFiles,
      postProcessResults,
      csvPostProcessResults,
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
