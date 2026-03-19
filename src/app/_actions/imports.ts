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
  deserializeNodesFromString,
  parse,
  Transaction,
  Value,
  type Node,
} from 'beancount'
import { processTransaction, applyRuleManually } from '@/lib/rules/engine'
import { getUserVariablesForAccount } from '@/lib/rules/variables'
import { replaceVariables } from '@/lib/string/replaceVariables'
import { getGoCardless } from '@/lib/goCardless/goCardless'
import type { Rule } from '@/lib/db/types'

/**
 * Re-processes a transaction while preserving manually applied rules
 */
function reprocessTransactionPreservingManualRules(
  originalTransaction: Transaction,
  existingMatchedRules: ProcessedTransaction['matchedRules'],
  rules: Rule[],
  userVariables: Record<string, string>,
  skippedRuleIds: string[] = [],
  manualRuleIdsToExclude: Set<string> = new Set(),
): {
  nodes: Node[]
  matchedRules: ProcessedTransaction['matchedRules']
  warnings: string[]
} {
  // Filter manual rules to preserve (exclude specified rules)
  const manualRulesToApply = existingMatchedRules.filter(
    (mr) =>
      mr.applicationType === 'manual' && !manualRuleIdsToExclude.has(mr.ruleId),
  )

  // Skip automatic matching for rules that were manually applied
  const manualRuleIds = new Set(manualRulesToApply.map((mr) => mr.ruleId))
  const combinedSkippedRuleIds = [
    ...skippedRuleIds,
    ...Array.from(manualRuleIds),
  ]

  // Re-run automatic rules (skipping manually applied ones)
  const {
    nodes: autoNodes,
    matchedRules: autoRules,
    warnings: autoWarnings,
  } = processTransaction(
    originalTransaction,
    rules,
    userVariables,
    combinedSkippedRuleIds,
  )

  // Re-apply manual rules on top of automatic results
  let currentNodes: Node[] = autoNodes
  const manualWarnings: string[] = []

  for (const manualRule of manualRulesToApply) {
    const rule = rules.find((r) => r.id === manualRule.ruleId)
    if (rule) {
      const nextNodes: Node[] = []
      for (const node of currentNodes) {
        if (node.type === 'transaction') {
          const result = applyRuleManually(
            node as Transaction,
            rule,
            userVariables,
          )
          nextNodes.push(...result.nodes)
          manualWarnings.push(...result.warnings)
        } else {
          nextNodes.push(node)
        }
      }
      currentNodes = nextNodes
    }
  }

  // Combine automatic and manual rules
  return {
    nodes: currentNodes,
    matchedRules: [...autoRules, ...manualRulesToApply],
    warnings: [...autoWarnings, ...manualWarnings],
  }
}

/**
 * Helper to create a ReadableStream that sends an error message and closes
 */
function createErrorStream(errorMessage: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode(`Error: ${errorMessage}\n`))
      controller.close()
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

export async function runImport(accountId: string): Promise<ReadableStream> {
  // Get the account configuration
  const db = await getDb()
  const config = db.data.config
  const account = config.accounts.find((acc) => acc.id === accountId)

  if (!account) {
    return createErrorStream(`Account with ID "${accountId}" not found`)
  }

  if (!account.goCardless) {
    return createErrorStream(
      `Account "${account.name}" has no goCardless connection`,
    )
  }

  // Check if EUA has expired before attempting to fetch
  const now = Temporal.Now.instant()
  if (
    Temporal.Instant.compare(
      account.goCardless.endUserAgreementValidTill,
      now,
    ) < 0
  ) {
    return createErrorStream(
      `GoCardless connection for "${account.name}" has expired. Please reconnect in account settings.`,
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
    return createErrorStream(`Account "${account.name}" has no beangulpCommand`)
  }

  // Check for existing pending imports for this account
  const pendingImport = db.data.imports?.find(
    (imp) => imp.accountId === accountId,
  )
  if (pendingImport) {
    return createErrorStream(
      `Account "${account.name}" already has a pending import. Confirm or delete it first.`,
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
  let transactions
  try {
    transactions = await goCardless.getTransationsForAccounts(
      account.goCardless!.accounts,
      account.goCardless!.importedTill,
      yesterday,
      2,
      account.goCardless?.reversePayee ?? false,
    )
  } catch (error) {
    return createErrorStream(
      error instanceof Error ? error.message : String(error),
    )
  }

  if (transactions.length === 0) {
    return createErrorStream('No new transactions')
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

                // Validate that only transaction, comment, and blankline nodes are present
                const allowedTypes = ['transaction', 'comment', 'blankline']
                const unsupportedNodes = parseResult.nodes.filter(
                  (node) => !allowedTypes.includes(node.type),
                )

                if (unsupportedNodes.length > 0) {
                  const unsupportedTypes = [
                    ...new Set(unsupportedNodes.map((e) => e.type)),
                  ]
                  throw new Error(
                    `Unsupported directives found: ${unsupportedTypes.join(', ')}. Only transaction and comment directives are supported.`,
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
                const transactions = parseResult.nodes.filter(
                  (node): node is Transaction => node.type === 'transaction',
                )

                for (const transaction of transactions) {
                  // Store the original transaction JSON before processing
                  const originalTransactionJSON = JSON.stringify(
                    transaction.toJSON(),
                  )

                  // Process the transaction with rules
                  const { nodes, matchedRules, warnings } = processTransaction(
                    transaction,
                    rules,
                    userVariables,
                  )

                  // Create ProcessedTransaction object
                  const processedTx: ProcessedTransaction = {
                    id: randomUUID(),
                    originalTransaction: originalTransactionJSON,
                    processedNodes: JSON.stringify(
                      nodes.map((e) => e.toJSON()),
                    ),
                    matchedRules,
                    warnings,
                    skippedRuleIds: [],
                  }

                  processedTransactions.push(processedTx)
                }

                // Count transaction nodes
                const transactionCount = transactions.length

                // Save to database
                const importResult: ImportResult = {
                  id: importId,
                  accountId,
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

                await db.write()

                // Send the import ID
                safeEnqueue(encoder.encode(`__IMPORT_ID__\n`))
                safeEnqueue(encoder.encode(importId))
                safeEnqueue(encoder.encode(`\n`))
              } catch (error) {
                safeEnqueue(
                  encoder.encode(
                    `\nBeancount parsing failed: ${error instanceof Error ? error.message : String(error)}\n`,
                  ),
                )
              } finally {
                safeClose()
              }
            })()
          } else {
            safeEnqueue(
              encoder.encode(`\nImport failed with exit code: ${code}\n`),
            )
            safeClose()
          }
        })

        // Handle process errors
        childProcess.on('error', (error) => {
          safeEnqueue(
            encoder.encode(`\nError executing command: ${error.message}\n`),
          )
          safeClose()
        })
      } catch (error) {
        safeEnqueue(
          encoder.encode(
            `Error: ${error instanceof Error ? error.message : String(error)}\n`,
          ),
        )
        safeClose()
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
      const { nodes, matchedRules, warnings } = processTransaction(
        transactionToProcess,
        rules,
        userVariables,
        skippedRuleIds,
      )

      // Update the processed transaction
      processedTx.processedNodes = JSON.stringify(nodes.map((n) => n.toJSON()))
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

    // Process with current rules, honoring skipped rules and preserving manual rules
    const { nodes, matchedRules, warnings } =
      reprocessTransactionPreservingManualRules(
        transactionToProcess,
        processedTx.matchedRules,
        rules,
        userVariables,
        skippedRuleIds,
      )

    // Update the processed transaction
    processedTx.processedNodes = JSON.stringify(nodes.map((n) => n.toJSON()))
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

    const { nodes, matchedRules, warnings } =
      reprocessTransactionPreservingManualRules(
        transactionToProcess,
        processedTx.matchedRules,
        rules,
        userVariables,
        processedTx.skippedRuleIds,
      )

    // Update the processed transaction
    processedTx.processedNodes = JSON.stringify(nodes.map((n) => n.toJSON()))
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

      // Load current nodes (current state, not original)
      const currentNodes: Node[] = deserializeNodesFromString(
        processedTx.processedNodes,
      )

      // Apply manual rule to each transaction node, keep others unchanged
      const resultNodes: Node[] = []
      let lastResult: ReturnType<typeof applyRuleManually> | null = null

      for (const node of currentNodes) {
        if (node.type === 'transaction') {
          const txResult = applyRuleManually(
            node as Transaction,
            rule,
            userVariables,
          )
          resultNodes.push(...txResult.nodes)
          lastResult = txResult
        } else {
          resultNodes.push(node)
        }
      }

      if (!lastResult) continue // No transactions found

      // Update the processed nodes
      processedTx.processedNodes = JSON.stringify(
        resultNodes.map((n) => n.toJSON()),
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

      const manualRuleIdsToExclude = new Set([ruleId])
      const { nodes, matchedRules, warnings } =
        reprocessTransactionPreservingManualRules(
          originalTransaction,
          processedTx.matchedRules,
          rules,
          userVariables,
          [],
          manualRuleIdsToExclude,
        )

      processedTx.processedNodes = JSON.stringify(nodes.map((e) => e.toJSON()))
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
 * Update metadata on a transaction's original transaction, then re-run rules.
 * This modifies originalTransaction so the metadata persists across rule re-executions.
 */
export async function updateTransactionMeta(
  importId: string,
  transactionId: string,
  key: string,
  value: string | number | boolean | null,
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

    // Parse and update the original transaction
    const originalTx = Transaction.fromJSON(processedTx.originalTransaction)
    originalTx.metadata ??= {}

    if (value === null) {
      // Remove the metadata key
      delete originalTx.metadata[key]
    } else {
      // Set the metadata value
      let valueType: 'string' | 'numbers' | 'boolean'
      switch (typeof value) {
        case 'string':
          valueType = 'string'
          break
        case 'number':
          valueType = 'numbers'
          break
        case 'boolean':
          valueType = 'boolean'
          break
      }
      originalTx.metadata[key] = new Value({ type: valueType, value })
    }

    // Save the updated original transaction
    processedTx.originalTransaction = JSON.stringify(originalTx.toJSON())

    // Re-run rules to update processedNodes with the new metadata
    const account = db.data.config.accounts.find(
      (acc) => acc.id === importResult.accountId,
    )
    const rules = account?.rules ?? []
    const userVariables = await getUserVariablesForAccount(
      importResult.accountId,
    )
    const skippedRuleIds = processedTx.skippedRuleIds ?? []

    const { nodes, matchedRules, warnings } =
      reprocessTransactionPreservingManualRules(
        originalTx,
        processedTx.matchedRules,
        rules,
        userVariables,
        skippedRuleIds,
      )

    // Update the processed transaction
    processedTx.processedNodes = JSON.stringify(nodes.map((e) => e.toJSON()))
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
