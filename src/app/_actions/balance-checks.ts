'use server'

import { Temporal } from '@js-temporal/polyfill'
import type { Node } from 'beancount'
import { getDb } from '@/lib/db/db'
import { getGoCardless } from '@/lib/goCardless/goCardless'
import type { Account } from '@/lib/db/types'
import {
  backupFile,
  commitTempFile,
  createTempFile,
  deleteBackup,
  deleteTempFile,
  fileExists,
  restoreBackup,
} from '@/lib/beancount/fileOperations'
import { mergeNodesIntoFile } from '@/lib/beancount/fileMerge'
import { executePostProcessCommand } from '@/lib/beancount/postProcess'
import {
  buildBalanceCheckNodes,
  calculateTargetBalanceAmount,
  getBalanceCheckAccount,
  getDefaultBalanceTargetDate,
  getSupportedBalanceTypes,
  selectPreferredBalances,
  type GeneratedBalanceCheck,
  type GeneratedBalanceCheckNode,
} from '@/lib/beancount/balanceChecks'

export interface InsertBalanceChecksResult {
  success: boolean
  error?: string
  errorDetails?: string
  filesModified?: string[]
  balanceChecks?: GeneratedBalanceCheck[]
  accountErrors?: AccountBalanceCheckError[]
  postProcessResults?: Record<string, { success: boolean; output: string }>
}

export interface AccountBalanceCheckError {
  accountId: string
  accountName?: string
  error: string
}

interface BalanceCheckFileGroup {
  outputFile: string
  accountId: string
  accountName: string
  nodes: Node[]
  balanceChecks: GeneratedBalanceCheck[]
}

function extractErrorDetails(error: unknown): string | undefined {
  const messages: string[] = []
  let current: unknown = (error as { cause?: unknown } | null)?.cause
  while (current instanceof Error) {
    messages.push(current.message)
    current = (current as { cause?: unknown }).cause
  }
  return messages.length > 0 ? messages.join('\n') : undefined
}

function validateAccountForBalanceChecks(
  account: Account | undefined,
  accountId: string,
  pendingAccountIds: Set<string>,
): Account {
  if (!account) {
    throw new Error(`Account with ID "${accountId}" not found`)
  }

  if (pendingAccountIds.has(account.id)) {
    throw new Error(
      `Account "${account.name}" has a pending import. Confirm or delete it before inserting balance checks.`,
    )
  }

  if (!account.goCardless) {
    throw new Error(`Account "${account.name}" has no GoCardless connection`)
  }

  getBalanceCheckAccount(account)

  if (account.goCardless.accounts.length === 0) {
    throw new Error(`Account "${account.name}" has no linked GoCardless IDs`)
  }

  const now = Temporal.Now.instant()
  if (
    Temporal.Instant.compare(
      account.goCardless.endUserAgreementValidTill,
      now,
    ) < 0
  ) {
    throw new Error(
      `GoCardless connection for "${account.name}" has expired. Please reconnect in account settings.`,
    )
  }

  return account
}

async function generateBalanceChecksForAccount(
  account: Account,
  targetDate: Temporal.PlainDate,
): Promise<GeneratedBalanceCheckNode[]> {
  const goCardless = await getGoCardless()
  const selectedBalances: Array<{
    balance: Awaited<ReturnType<typeof goCardless.getBalances>>[number]
    goCardlessAccountId: string
    amount: string
    sourceReferenceDate: string
  }> = []
  const defaultSourceDate = targetDate.add({ days: 1 })

  for (const goCardlessAccountId of account.goCardless!.accounts) {
    const balances = await goCardless.getBalances(goCardlessAccountId)
    const selectedAccountBalances = selectPreferredBalances(balances)

    if (selectedAccountBalances.length === 0) {
      const availableBalances = balances
        .map(
          (balance) =>
            `${balance.balanceType} ${balance.referenceDate ?? 'no-reference-date'} ${balance.balanceAmount.amount} ${balance.balanceAmount.currency}`,
        )
        .join(', ')

      throw new Error(
        `No supported balance found for "${account.name}" GoCardless account ${goCardlessAccountId}. Supported types: ${getSupportedBalanceTypes().join(', ')}. Available balances: ${availableBalances || 'none'}`,
      )
    }

    for (const balance of selectedAccountBalances) {
      const sourceDate = balance.referenceDate
        ? Temporal.PlainDate.from(balance.referenceDate)
        : defaultSourceDate
      const comparison = Temporal.PlainDate.compare(sourceDate, targetDate)
      const dateFrom = comparison > 0 ? targetDate : sourceDate
      const dateTo = comparison > 0 ? sourceDate : targetDate
      const adjustmentTransactions =
        comparison === 0
          ? []
          : await goCardless.getBookedTransactionsForAccounts(
              [goCardlessAccountId],
              dateFrom,
              dateTo,
            )

      selectedBalances.push({
        balance,
        goCardlessAccountId,
        amount: calculateTargetBalanceAmount(
          balance,
          targetDate,
          adjustmentTransactions,
          sourceDate,
        ),
        sourceReferenceDate:
          balance.referenceDate ?? `${sourceDate.toString()} (assumed current)`,
      })
    }
  }

  return buildBalanceCheckNodes(account, targetDate, selectedBalances)
}

function groupBalanceChecksByOutputFile(
  balanceChecks: GeneratedBalanceCheckNode[],
): BalanceCheckFileGroup[] {
  const groups = new Map<string, BalanceCheckFileGroup>()

  for (const balanceCheck of balanceChecks) {
    if (!groups.has(balanceCheck.outputFile)) {
      groups.set(balanceCheck.outputFile, {
        outputFile: balanceCheck.outputFile,
        accountId: balanceCheck.accountId,
        accountName: balanceCheck.accountName,
        nodes: [],
        balanceChecks: [],
      })
    }

    const group = groups.get(balanceCheck.outputFile)!
    group.nodes.push(balanceCheck.node)
    group.balanceChecks.push({
      accountId: balanceCheck.accountId,
      accountName: balanceCheck.accountName,
      account: balanceCheck.account,
      date: balanceCheck.date,
      amount: balanceCheck.amount,
      currency: balanceCheck.currency,
      outputFile: balanceCheck.outputFile,
      sourceReferenceDates: balanceCheck.sourceReferenceDates,
      sourceBalanceTypes: balanceCheck.sourceBalanceTypes,
      sourceAccountIds: balanceCheck.sourceAccountIds,
    })
  }

  return Array.from(groups.values())
}

async function cleanupFiles(
  backupMap: Record<string, string>,
  tempFileMap: Record<string, string>,
) {
  for (const tempPath of Object.values(tempFileMap)) {
    await deleteTempFile(tempPath).catch((error) =>
      console.error('Failed to delete temp file:', error),
    )
  }
  for (const backupPath of Object.values(backupMap)) {
    await deleteBackup(backupPath).catch((error) =>
      console.error('Failed to delete backup:', error),
    )
  }
}

export async function insertBalanceChecks(
  accountIds: string[],
): Promise<InsertBalanceChecksResult> {
  const backupMap: Record<string, string> = {}
  const tempFileMap: Record<string, string> = {}

  try {
    const uniqueAccountIds = [...new Set(accountIds)]
    if (uniqueAccountIds.length === 0) {
      return { success: false, error: 'No accounts selected' }
    }

    const db = await getDb()
    const pendingAccountIds = new Set(
      (db.data.imports ?? []).map((importResult) => importResult.accountId),
    )
    const accountErrors: AccountBalanceCheckError[] = []
    const accounts: Account[] = []

    for (const accountId of uniqueAccountIds) {
      const account = db.data.config.accounts.find(
        (item) => item.id === accountId,
      )

      try {
        accounts.push(
          validateAccountForBalanceChecks(
            account,
            accountId,
            pendingAccountIds,
          ),
        )
      } catch (error) {
        accountErrors.push({
          accountId,
          accountName: account?.name,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const targetDate = getDefaultBalanceTargetDate()

    const generatedBalanceChecks = await Promise.all(
      accounts.map(async (account) => {
        try {
          return await generateBalanceChecksForAccount(account, targetDate)
        } catch (error) {
          accountErrors.push({
            accountId: account.id,
            accountName: account.name,
            error: error instanceof Error ? error.message : String(error),
          })
          return []
        }
      }),
    )
    const balanceChecks = generatedBalanceChecks.flat()

    if (balanceChecks.length === 0) {
      return {
        success: false,
        error:
          accountErrors.length > 0
            ? accountErrors.map((item) => item.error).join('\n')
            : 'No balance checks generated',
        accountErrors,
      }
    }

    const groups = groupBalanceChecksByOutputFile(balanceChecks)

    try {
      for (const group of groups) {
        if (await fileExists(group.outputFile)) {
          backupMap[group.outputFile] = await backupFile(group.outputFile)
        }
      }
    } catch (error) {
      await cleanupFiles(backupMap, tempFileMap)
      return {
        success: false,
        error: `Backup failed: ${error instanceof Error ? error.message : String(error)}`,
        errorDetails: extractErrorDetails(error),
      }
    }

    try {
      for (const group of groups) {
        const content = await mergeNodesIntoFile(
          group.outputFile,
          group.nodes,
          {
            addBlankLines: true,
            delimiterComment: `*** balance checks ${targetDate.toString()}`,
          },
        )
        tempFileMap[group.outputFile] = await createTempFile(
          content,
          group.outputFile,
        )
      }
    } catch (error) {
      await cleanupFiles(backupMap, tempFileMap)
      return {
        success: false,
        error: `Merge failed: ${error instanceof Error ? error.message : String(error)}`,
        errorDetails: extractErrorDetails(error),
      }
    }

    const postProcessResults: Record<
      string,
      { success: boolean; output: string }
    > = {}

    try {
      for (const group of groups) {
        const account = accounts.find((item) => item.id === group.accountId)
        const postProcessCommand =
          account?.postProcessCommand ??
          db.data.config.defaults?.postProcessCommand

        if (!postProcessCommand) continue

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
      await cleanupFiles(backupMap, tempFileMap)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        errorDetails: extractErrorDetails(error),
      }
    }

    const modifiedFiles: string[] = []
    try {
      for (const [finalPath, tempPath] of Object.entries(tempFileMap)) {
        await commitTempFile(tempPath, finalPath)
        modifiedFiles.push(finalPath)
      }
    } catch (error) {
      for (const [originalPath, backupPath] of Object.entries(backupMap)) {
        await restoreBackup(originalPath, backupPath).catch((restoreError) =>
          console.error('Failed to restore backup:', restoreError),
        )
      }
      await cleanupFiles(backupMap, tempFileMap)
      return {
        success: false,
        error: `Commit failed: ${error instanceof Error ? error.message : String(error)}`,
        errorDetails: extractErrorDetails(error),
      }
    }

    for (const backupPath of Object.values(backupMap)) {
      await deleteBackup(backupPath).catch((error) =>
        console.error('Backup cleanup failed:', error),
      )
    }

    return {
      success: true,
      filesModified: modifiedFiles,
      balanceChecks: groups.flatMap((group) => group.balanceChecks),
      accountErrors,
      postProcessResults,
    }
  } catch (error) {
    await cleanupFiles(backupMap, tempFileMap)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorDetails: extractErrorDetails(error),
    }
  }
}
