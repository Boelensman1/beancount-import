import { deserializeEntriesFromString, type Entry } from 'beancount'
import type { ImportResult, Account } from '../db/types'

export interface TransactionGroup {
  outputFile: string
  accountId: string
  accountName: string
  entries: Entry[]
  transactionIds: string[]
  csvFilePaths: string[]
}

export function groupTransactionsByOutputFile(
  imports: ImportResult[],
  accounts: Account[],
): TransactionGroup[] {
  const accountMap = new Map(accounts.map((acc) => [acc.id, acc]))
  const groups = new Map<string, TransactionGroup>()

  for (const importResult of imports) {
    const account = accountMap.get(importResult.accountId)
    if (!account) {
      throw new Error(
        `Account not found for import ${importResult.id}: ${importResult.accountId}`,
      )
    }

    for (const processedTx of importResult.transactions) {
      // Parse all entries from the processed transaction
      const entries = deserializeEntriesFromString(processedTx.processedEntries)

      // Group each entry by its outputFile
      for (const entry of entries) {
        const outputFile: string =
          (entry.internalMetadata.outputFile as string | undefined) ??
          account.defaultOutputFile

        if (!groups.has(outputFile)) {
          groups.set(outputFile, {
            outputFile,
            accountId: account.id,
            accountName: account.name,
            entries: [],
            transactionIds: [],
            csvFilePaths: [],
          })
        }

        const group = groups.get(outputFile)!
        group.entries.push(entry)
        // Only add transaction metadata once per processedTx, not per entry
        // We'll track which processedTx IDs have been added to this group
      }

      // Track transaction ID and CSV path for the first entry's group
      // (typically all entries from same source go to same file)
      const firstEntry = entries[0]
      if (firstEntry) {
        const outputFile: string =
          (firstEntry.internalMetadata.outputFile as string | undefined) ??
          account.defaultOutputFile
        const group = groups.get(outputFile)!
        group.transactionIds.push(processedTx.id)
        group.csvFilePaths.push(importResult.csvPath)
      }
    }
  }

  return Array.from(groups.values())
}
