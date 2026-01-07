'use server'

import { Temporal } from '@js-temporal/polyfill'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { stringify } from 'csv-stringify/sync'
import { randomUUID } from 'node:crypto'
import { getDb } from '@/lib/db/db'
import type { ImportResult, ProcessedTransaction } from '@/lib/db/types'
import {
  deserializeEntriesFromString,
  parse,
  Transaction,
  type Entry,
} from 'beancount'
import { processTransaction, applyRuleManually } from '@/lib/rules/engine'
import { getUserVariablesForAccount } from '@/lib/rules/variables'
import { replaceVariables } from '@/lib/string/replaceVariables'
import { getGoCardless } from '@/lib/goCardless/goCardless'
import { checkAndDeleteEmptyBatch } from '@/app/_actions/batches'

/**
 * Helper to create a ReadableStream that sends an error message and closes
 */
function createErrorStream(
  errorMessage: string,
  batchId: string,
): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode(`Error: ${errorMessage}\n`))
      checkAndDeleteEmptyBatch(batchId).then(() => controller.close())
    },
  })
}

export async function getImports(): Promise<ImportResult[]> {
  const db = await getDb()

  // Return all imports sorted by timestamp (newest first)
  return (db.toJSON().imports ?? []).sort(
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

export async function getImportResult(
  id: string,
): Promise<ImportResult | null> {
  const db = await getDb()

  const importResult = db.toJSON().imports?.find((imp) => imp.id === id)

  return importResult ?? null
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
    return createErrorStream(
      `Account with ID "${accountId}" not found`,
      batchId,
    )
  }

  if (!account.goCardless) {
    return createErrorStream(
      `Account "${account.name}" has no goCardless connection`,
      batchId,
    )
  }

  const tempDir = path.resolve(
    await fs.mkdtemp(path.join(os.tmpdir(), 'beancount-import-')),
  )
  const beangulpCommand =
    account.beangulpCommand ?? config.defaults.beangulpCommand
  const processedCommand = replaceVariables(beangulpCommand, {
    account: account.name,
    tempFolder: tempDir,
  })

  if (!processedCommand.trim()) {
    return createErrorStream(
      `Account "${account.name}" has no beangulpCommand`,
      batchId,
    )
  }

  // Check for existing pending imports for this account
  const pendingImport = db.data.imports?.find(
    (imp) => imp.accountId === accountId,
  )
  if (pendingImport) {
    return createErrorStream(
      `Account "${account.name}" already has a pending import. Confirm or delete it first.`,
      batchId,
    )
  }

  const goCardless = await getGoCardless()

  // prepare variables (done first so that we fail fast if variables are missing)
  const yesterday = new Temporal.ZonedDateTime(
    Temporal.Now.instant().epochNanoseconds,
    Temporal.Now.timeZoneId(),
  )
    .subtract({ days: 1 })
    .toPlainDate()

  const csvFullPath = path.join(
    tempDir,
    replaceVariables(account.csvFilename, {
      account: account.name,
      importedFrom: `${account.goCardless!.importedTill.toString().replaceAll('-', '')}`,
      importedTo: `${yesterday.toString().replaceAll('-', '')}`,
    }),
  )

  // start by getting the csv
  const transactions = await goCardless.getTransationsForAccounts(
    account.goCardless!.accounts,
    account.goCardless!.importedTill,
    yesterday,
    2,
    account.goCardless?.reversePayee ?? false,
  )

  if (transactions.length === 0) {
    return createErrorStream('No new transactions', batchId)
  }

  const csv = stringify(
    [
      Object.keys(transactions[0]),
      ...transactions.map((t) => Object.values(t)),
    ],
    {
      cast: {
        // call toString on the PlainDate's
        object: (val) => val.toString(),
      },
    },
  )
  await fs.writeFile(csvFullPath, csv)

  // Create a readable stream for the command output
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      let controllerClosed = false

      // Helper to safely enqueue - guards against writing to closed controller
      const safeEnqueue = (data: Uint8Array) => {
        if (!controllerClosed) {
          controller.enqueue(data)
        }
      }

      // Helper to safely close controller
      const safeClose = () => {
        if (!controllerClosed) {
          controllerClosed = true
          controller.close()
        }
      }

      try {
        // Send initial message
        safeEnqueue(
          encoder.encode(`Starting import for account: ${account.name}\n`),
        )
        safeEnqueue(encoder.encode(`Command: ${processedCommand}\n`))
        safeEnqueue(encoder.encode(`\n`))

        // Spawn the child process
        const childProcess = spawn(processedCommand, {
          shell: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        })

        // Buffer to accumulate output for beancount parsing
        let outputBuffer = ''

        // Stream stdout
        childProcess.stdout.on('data', (data) => {
          const dataStr = data.toString()
          outputBuffer += dataStr
          safeEnqueue(encoder.encode(dataStr))
        })

        // Stream stderr
        childProcess.stderr.on('data', (data) => {
          safeEnqueue(encoder.encode(`[stderr] ${data.toString()}`))
        })

        // Handle process completion
        childProcess.on('close', (code) => {
          if (code === 0) {
            safeEnqueue(
              encoder.encode(
                `\nImport completed successfully (exit code: ${code})\n`,
              ),
            )

            // Parse the accumulated output with beancount and save to database
            ;(async () => {
              try {
                const parseResult = parse(outputBuffer)

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

                // Get user-defined variables for this account
                const userVariables =
                  await getUserVariablesForAccount(accountId)

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

                  // Process the transaction with rules
                  const { entries, matchedRules, warnings } =
                    processTransaction(transaction, rules, userVariables)

                  // Create ProcessedTransaction object
                  const processedTx: ProcessedTransaction = {
                    id: randomUUID(),
                    originalTransaction: originalTransactionJSON,
                    processedEntries: JSON.stringify(
                      entries.map((e) => e.toJSON()),
                    ),
                    matchedRules,
                    warnings,
                    skippedRuleIds: [],
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
                  csvPath: csvFullPath,
                  importedFrom: account.goCardless!.importedTill.toString(),
                  importedTo: yesterday.toString(),
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
                safeEnqueue(encoder.encode(`__IMPORT_ID__\n`))
                safeEnqueue(encoder.encode(importId))
                safeEnqueue(encoder.encode(`\n`))

                // Check if batch should be deleted
                await checkAndDeleteEmptyBatch(batchId)
              } catch (error) {
                safeEnqueue(
                  encoder.encode(
                    `\nBeancount parsing failed: ${error instanceof Error ? error.message : String(error)}\n`,
                  ),
                )

                // Check if batch should be deleted
                await checkAndDeleteEmptyBatch(batchId)
              } finally {
                safeClose()
              }
            })()
          } else {
            safeEnqueue(
              encoder.encode(`\nImport failed with exit code: ${code}\n`),
            )

            // Check if batch should be deleted
            checkAndDeleteEmptyBatch(batchId).then(() => {
              safeClose()
            })
          }
        })

        // Handle process errors
        childProcess.on('error', (error) => {
          safeEnqueue(
            encoder.encode(`\nError executing command: ${error.message}\n`),
          )

          // Check if batch should be deleted
          checkAndDeleteEmptyBatch(batchId).then(() => {
            safeClose()
          })
        })
      } catch (error) {
        safeEnqueue(
          encoder.encode(
            `Error: ${error instanceof Error ? error.message : String(error)}\n`,
          ),
        )

        // Check if batch should be deleted
        checkAndDeleteEmptyBatch(batchId).then(() => {
          safeClose()
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

    // Get user-defined variables for this account
    const userVariables = await getUserVariablesForAccount(
      importResult.accountId,
    )

    // Re-process each transaction
    for (const processedTx of importResult.transactions) {
      // Transaction for processing
      const transactionToProcess = Transaction.fromJSON(
        processedTx.originalTransaction,
      )

      // Preserve skipped rules when re-executing
      const skippedRuleIds = processedTx.skippedRuleIds ?? []

      // Process with current rules, honoring skipped rules
      const { entries, matchedRules, warnings } = processTransaction(
        transactionToProcess,
        rules,
        userVariables,
        skippedRuleIds,
      )

      // Update the processed transaction
      processedTx.processedEntries = JSON.stringify(
        entries.map((e) => e.toJSON()),
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

    // Get user-defined variables for this account
    const userVariables = await getUserVariablesForAccount(
      importResult.accountId,
    )

    // Transaction for processing
    const transactionToProcess = Transaction.fromJSON(
      processedTx.originalTransaction,
    )

    // Preserve skipped rules when re-executing
    const skippedRuleIds = processedTx.skippedRuleIds ?? []

    // Process with current rules, honoring skipped rules
    const { entries, matchedRules, warnings } = processTransaction(
      transactionToProcess,
      rules,
      userVariables,
      skippedRuleIds,
    )

    // Update the processed transaction
    processedTx.processedEntries = JSON.stringify(
      entries.map((e) => e.toJSON()),
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
 * Toggle a rule as skipped for a transaction
 * Adds/removes the rule from skippedRuleIds and re-runs rules
 */
export async function toggleSkippedRule(
  importId: string,
  transactionId: string,
  ruleId: string,
): Promise<{ success: boolean; error?: string; isSkipped?: boolean }> {
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

    // Get user-defined variables for this account
    const userVariables = await getUserVariablesForAccount(
      importResult.accountId,
    )

    // Initialize skippedRuleIds if not present
    if (!processedTx.skippedRuleIds) {
      processedTx.skippedRuleIds = []
    }

    // Toggle the rule in skippedRuleIds
    const skippedIndex = processedTx.skippedRuleIds.indexOf(ruleId)
    let isSkipped: boolean
    if (skippedIndex >= 0) {
      // Remove from skipped (unskip)
      processedTx.skippedRuleIds.splice(skippedIndex, 1)
      isSkipped = false
    } else {
      // Add to skipped (skip)
      processedTx.skippedRuleIds.push(ruleId)
      isSkipped = true
    }

    // Re-process the transaction with updated skipped rules
    const transactionToProcess = Transaction.fromJSON(
      processedTx.originalTransaction,
    )

    const { entries, matchedRules, warnings } = processTransaction(
      transactionToProcess,
      rules,
      userVariables,
      processedTx.skippedRuleIds,
    )

    // Update the processed transaction
    processedTx.processedEntries = JSON.stringify(
      entries.map((e) => e.toJSON()),
    )
    processedTx.matchedRules = matchedRules
    processedTx.warnings = warnings

    await db.write()

    return { success: true, isSkipped }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Apply a single rule manually to multiple transactions
 * Adds the manual rule to existing matched rules (doesn't replace)
 */
export async function applyManualRuleToTransactions(
  importId: string,
  transactionIds: string[],
  ruleId: string,
): Promise<{ success: boolean; error?: string; appliedCount?: number }> {
  try {
    const db = await getDb()

    // Find the import
    const importResult = db.data.imports?.find((imp) => imp.id === importId)
    if (!importResult) {
      return { success: false, error: 'Import not found' }
    }

    // Get the account and find the rule
    const account = db.data.config.accounts.find(
      (acc) => acc.id === importResult.accountId,
    )
    const rule = account?.rules.find((r) => r.id === ruleId)
    if (!rule) {
      return { success: false, error: 'Rule not found' }
    }

    if (!rule.allowManualSelection) {
      return {
        success: false,
        error: 'This rule is not available for manual selection',
      }
    }

    // Get user-defined variables for this account
    const userVariables = await getUserVariablesForAccount(
      importResult.accountId,
    )

    let appliedCount = 0

    // Process each transaction
    for (const transactionId of transactionIds) {
      const processedTx = importResult.transactions.find(
        (tx) => tx.id === transactionId,
      )
      if (!processedTx) continue

      // Check if this rule was already manually applied to this transaction
      const alreadyApplied = processedTx.matchedRules.some(
        (mr) => mr.ruleId === ruleId && mr.applicationType === 'manual',
      )
      if (alreadyApplied) continue // Skip if already manually applied

      // Load current entries (current state, not original)
      const currentEntries: Entry[] = deserializeEntriesFromString(
        processedTx.processedEntries,
      )

      // Apply manual rule to each transaction entry, keep others unchanged
      const resultEntries: Entry[] = []
      let lastResult: ReturnType<typeof applyRuleManually> | null = null

      for (const entry of currentEntries) {
        if (entry.type === 'transaction') {
          const txResult = applyRuleManually(
            entry as Transaction,
            rule,
            userVariables,
          )
          resultEntries.push(...txResult.entries)
          lastResult = txResult
        } else {
          resultEntries.push(entry)
        }
      }

      if (!lastResult) continue // No transactions found

      // Update the processed entries
      processedTx.processedEntries = JSON.stringify(
        resultEntries.map((e) => e.toJSON()),
      )

      // Add manual rule to matched rules (additive, not replacement)
      processedTx.matchedRules.push({
        ruleId: lastResult.ruleId,
        ruleName: lastResult.ruleName,
        actionsApplied: lastResult.actionsApplied,
        applicationType: 'manual',
      })

      // Add warnings if any
      processedTx.warnings.push(...lastResult.warnings)

      appliedCount++
    }

    await db.write()

    return { success: true, appliedCount }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Remove a manually-applied rule from transactions
 * Re-runs automatic rules from original transaction to restore state
 */
export async function removeManualRule(
  importId: string,
  transactionIds: string[],
  ruleId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb()

    const importResult = db.data.imports?.find((imp) => imp.id === importId)
    if (!importResult) {
      return { success: false, error: 'Import not found' }
    }

    const account = db.data.config.accounts.find(
      (acc) => acc.id === importResult.accountId,
    )
    const rules = account?.rules ?? []

    // Get user-defined variables for this account
    const userVariables = await getUserVariablesForAccount(
      importResult.accountId,
    )

    for (const transactionId of transactionIds) {
      const processedTx = importResult.transactions.find(
        (tx) => tx.id === transactionId,
      )
      if (!processedTx) continue

      // Start from original transaction
      const originalTransaction = Transaction.fromJSON(
        processedTx.originalTransaction,
      )

      // Re-apply automatic rules
      const {
        entries: autoEntries,
        matchedRules: autoRules,
        warnings: autoWarnings,
      } = processTransaction(originalTransaction, rules, userVariables)

      // Re-apply manual rules EXCEPT the one being removed
      const manualRulesToApply = processedTx.matchedRules.filter(
        (mr) => mr.applicationType === 'manual' && mr.ruleId !== ruleId,
      )

      // Start with the entries from automatic rules
      let currentEntries: Entry[] = autoEntries
      const manualWarnings: string[] = []

      for (const manualRule of manualRulesToApply) {
        const rule = rules.find((r) => r.id === manualRule.ruleId)
        if (rule) {
          // Apply manual rule to each transaction entry, keep others unchanged
          const nextEntries: Entry[] = []
          for (const entry of currentEntries) {
            if (entry.type === 'transaction') {
              const result = applyRuleManually(
                entry as Transaction,
                rule,
                userVariables,
              )
              nextEntries.push(...result.entries)
              manualWarnings.push(...result.warnings)
            } else {
              nextEntries.push(entry)
            }
          }
          currentEntries = nextEntries
        }
      }

      // Update processed entries
      processedTx.processedEntries = JSON.stringify(
        currentEntries.map((e) => e.toJSON()),
      )
      processedTx.matchedRules = [...autoRules, ...manualRulesToApply]
      processedTx.warnings = [...autoWarnings, ...manualWarnings]
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
