import { deserializeNodesFromString, type Node } from 'beancount'
import type { ImportResult, Account } from '../db/types'

export interface TransactionGroup {
  outputFile: string
  accountId: string
  accountName: string
  nodes: Node[]
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
      // Parse all nodes from the processed transaction
      const nodes = deserializeNodesFromString(processedTx.processedNodes)

      // Group each node by its outputFile
      for (const node of nodes) {
        const outputFile: string =
          (node.internalMetadata.outputFile as string | undefined) ??
          account.defaultOutputFile

        if (!groups.has(outputFile)) {
          groups.set(outputFile, {
            outputFile,
            accountId: account.id,
            accountName: account.name,
            nodes: [],
            transactionIds: [],
            csvFilePaths: [],
          })
        }

        const group = groups.get(outputFile)!
        group.nodes.push(node)
        // Only add transaction metadata once per processedTx, not per entry
        // We'll track which processedTx IDs have been added to this group
      }

      // Track transaction ID and CSV path for the first entry's group
      // (typically all nodes from same source go to same file)
      const firstEntry = nodes[0]
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
