'use server'

import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { getDb } from '@/lib/db/db'
import type {
  Account,
  ImportResult,
  BatchImport,
  ProcessedTransaction,
} from '@/lib/db/types'
import { parse, Transaction } from 'beancount'
import { processTransaction } from '@/lib/rules/engine'
import { replaceVariables } from '@/lib/string/replaceVariables'
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

export async function getAccounts(): Promise<Account[]> {
  const db = await getDb()

  return db.data.config.accounts
}

export async function getImports(): Promise<ImportResult[]> {
  const db = await getDb()

  // Return all imports sorted by timestamp (newest first)
  return (db.data.imports ?? []).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )
}

export async function deleteImport(id: string): Promise<boolean> {
  const db = await getDb()

  if (!db.data.imports) {
    return false
  }

  const initialLength = db.data.imports.length
  db.data.imports = db.data.imports.filter((imp) => imp.id !== id)

  if (db.data.imports.length < initialLength) {
    await db.write()
    return true
  }

  return false
}

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

export async function getImportResult(
  id: string,
): Promise<ImportResult | null> {
  const db = await getDb()

  const importResult = db.data.imports?.find((imp) => imp.id === id)

  return importResult ?? null
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

  const batch = db.data.batches?.find((b) => b.id === batchId)
  if (!batch) {
    return null
  }

  const imports = (db.data.imports ?? []).filter((imp) =>
    batch.importIds.includes(imp.id),
  )

  // Sort imports by account order from config
  const accountOrder = db.data.config.accounts.map((acc) => acc.id)
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
  return (db.data.batches ?? []).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )
}

async function checkAndDeleteEmptyBatch(batchId: string): Promise<void> {
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

export async function runImport(
  accountId: string,
  batchId: string,
): Promise<ReadableStream> {
  // Get the account configuration
  const db = await getDb()
  const config = db.data.config
  const account = config.accounts.find((acc) => acc.id === accountId)

  if (!account) {
    // Return a stream that immediately sends error and closes
    return new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(
          encoder.encode(`Error: Account with ID "${accountId}" not found\n`),
        )

        // Mark import as completed and check if batch should be deleted
        checkAndDeleteEmptyBatch(batchId).then(() => {
          controller.close()
        })
      },
    })
  }

  if (!account.importerCommand) {
    // Return a stream that immediately sends error and closes
    return new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(
          encoder.encode(
            `Error: Account "${account.name}" has no importer command configured\n`,
          ),
        )

        // Mark import as completed and check if batch should be deleted
        checkAndDeleteEmptyBatch(batchId).then(() => {
          controller.close()
        })
      },
    })
  }

  // Create a readable stream for the command output
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      try {
        // Replace variables in the command before parsing
        const processedCommand = replaceVariables(account.importerCommand, {
          account: account.name,
        })

        // Parse the command - split by spaces but respect quotes
        const commandParts = processedCommand.match(/[^\s"]+|"([^"]*)"/g)
        if (!commandParts || commandParts.length === 0) {
          controller.enqueue(encoder.encode(`Error: Invalid command format\n`))
          controller.close()
          return
        }

        const command = commandParts[0].replace(/"/g, '')
        const args = commandParts.slice(1).map((arg) => arg.replace(/"/g, ''))

        // Send initial message
        controller.enqueue(
          encoder.encode(`Starting import for account: ${account.name}\n`),
        )
        controller.enqueue(encoder.encode(`Command: ${processedCommand}\n`))
        controller.enqueue(encoder.encode(`\n`))

        // Spawn the child process
        const childProcess = spawn(command, args, {
          shell: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        })

        // Buffer to accumulate output for beancount parsing
        let outputBuffer = ''

        // Stream stdout
        childProcess.stdout.on('data', (data) => {
          const dataStr = data.toString()
          outputBuffer += dataStr
          controller.enqueue(encoder.encode(dataStr))
        })

        // Stream stderr
        childProcess.stderr.on('data', (data) => {
          controller.enqueue(encoder.encode(`[stderr] ${data.toString()}`))
        })

        // Handle process completion
        childProcess.on('close', (code) => {
          if (code === 0) {
            controller.enqueue(
              encoder.encode(
                `\nImport completed successfully (exit code: ${code})\n`,
              ),
            )

            // Parse the accumulated output with beancount and save to database
            ;(async () => {
              try {
                const parseResult = parse(outputBuffer, {
                  skipBlanklines: false,
                })

                // Validate that only transaction, comment, and blankline entries are present
                const allowedTypes = ['transaction', 'comment', 'blankline']
                const unsupportedEntries = parseResult.entries.filter(
                  (entry) => !allowedTypes.includes(entry.type),
                )

                if (unsupportedEntries.length > 0) {
                  const unsupportedTypes = [
                    ...new Set(unsupportedEntries.map((e) => e.type)),
                  ]
                  throw new Error(
                    `Unsupported entry types found: ${unsupportedTypes.join(', ')}. Only transaction and comment entries are supported.`,
                  )
                }

                // Generate UUID for this import
                const importId = randomUUID()

                // Get the account rules for processing
                const db = await getDb()
                const accountData = db.data.config.accounts.find(
                  (acc) => acc.id === accountId,
                )
                const rules = accountData?.rules ?? []

                // Process each transaction with rules, creating before/after pairs
                const processedTransactions: ProcessedTransaction[] = []
                const transactions = parseResult.entries.filter(
                  (entry): entry is Transaction => entry.type === 'transaction',
                )

                for (const transaction of transactions) {
                  // Store the original transaction JSON before processing
                  const originalTransactionJSON = JSON.stringify(
                    transaction.toJSON(),
                  )

                  // Process the transaction with rules (modifies in-place)
                  const { matchedRules, warnings } = processTransaction(
                    transaction,
                    rules,
                  )

                  // Create ProcessedTransaction object
                  const processedTx: ProcessedTransaction = {
                    id: randomUUID(),
                    originalTransaction: originalTransactionJSON,
                    processedTransaction: JSON.stringify(transaction.toJSON()),
                    matchedRules,
                    warnings,
                  }

                  processedTransactions.push(processedTx)
                }

                // Count transaction entries
                const transactionCount = transactions.length

                // Save to database
                const importResult: ImportResult = {
                  id: importId,
                  accountId,
                  batchId,
                  timestamp: new Date().toISOString(),
                  transactions: processedTransactions,
                  transactionCount,
                }

                if (!db.data.imports) {
                  db.data.imports = []
                }
                db.data.imports.push(importResult)

                // Update the batch with this import ID
                const batch = db.data.batches?.find((b) => b.id === batchId)
                if (batch) {
                  batch.importIds.push(importId)
                }

                await db.write()

                // Send the import ID
                controller.enqueue(encoder.encode(`__IMPORT_ID__\n`))
                controller.enqueue(encoder.encode(importId))
                controller.enqueue(encoder.encode(`\n`))

                // Check if batch should be deleted
                await checkAndDeleteEmptyBatch(batchId)
              } catch (error) {
                controller.enqueue(
                  encoder.encode(
                    `\nBeancount parsing failed: ${error instanceof Error ? error.message : String(error)}\n`,
                  ),
                )

                // Check if batch should be deleted
                await checkAndDeleteEmptyBatch(batchId)
              } finally {
                controller.close()
              }
            })()
          } else {
            controller.enqueue(
              encoder.encode(`\nImport failed with exit code: ${code}\n`),
            )

            // Check if batch should be deleted
            checkAndDeleteEmptyBatch(batchId).then(() => {
              controller.close()
            })
          }
        })

        // Handle process errors
        childProcess.on('error', (error) => {
          controller.enqueue(
            encoder.encode(`\nError executing command: ${error.message}\n`),
          )

          // Check if batch should be deleted
          checkAndDeleteEmptyBatch(batchId).then(() => {
            controller.close()
          })
        })
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `Error: ${error instanceof Error ? error.message : String(error)}\n`,
          ),
        )

        // Check if batch should be deleted
        checkAndDeleteEmptyBatch(batchId).then(() => {
          controller.close()
        })
      }
    },
  })

  return stream
}

/**
 * Re-execute rules for all transactions in an import
 */
export async function reExecuteRulesForImport(
  importId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb()

    // Find the import
    const importResult = db.data.imports?.find((imp) => imp.id === importId)
    if (!importResult) {
      return { success: false, error: 'Import not found' }
    }

    // Get the account rules
    const account = db.data.config.accounts.find(
      (acc) => acc.id === importResult.accountId,
    )
    const rules = account?.rules ?? []

    // Re-process each transaction
    for (const processedTx of importResult.transactions) {
      // Transaction for processing
      const transactionToProcess = Transaction.fromJSON(
        processedTx.originalTransaction,
      )

      // Process with current rules
      const { matchedRules, warnings } = processTransaction(
        transactionToProcess,
        rules,
      )

      // Update the processed transaction
      processedTx.processedTransaction = JSON.stringify(
        transactionToProcess.toJSON(),
      )
      processedTx.matchedRules = matchedRules
      processedTx.warnings = warnings
    }

    await db.write()

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Re-execute rules for a single transaction in an import
 */
export async function reExecuteRulesForTransaction(
  importId: string,
  transactionId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb()

    // Find the import
    const importResult = db.data.imports?.find((imp) => imp.id === importId)
    if (!importResult) {
      return { success: false, error: 'Import not found' }
    }

    // Find the specific transaction
    const processedTx = importResult.transactions.find(
      (tx) => tx.id === transactionId,
    )
    if (!processedTx) {
      return { success: false, error: 'Transaction not found' }
    }

    // Get the account rules
    const account = db.data.config.accounts.find(
      (acc) => acc.id === importResult.accountId,
    )
    const rules = account?.rules ?? []

    // Transaction for processing
    const transactionToProcess = Transaction.fromJSON(
      processedTx.originalTransaction,
    )

    // Process with current rules
    const { matchedRules, warnings } = processTransaction(
      transactionToProcess,
      rules,
    )

    // Update the processed transaction
    processedTx.processedTransaction = JSON.stringify(
      transactionToProcess.toJSON(),
    )
    processedTx.matchedRules = matchedRules
    processedTx.warnings = warnings

    await db.write()

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
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
