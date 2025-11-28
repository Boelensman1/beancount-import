import { Transaction } from 'beancount'
import type { ImportResult, Account } from '../db/types'

export interface TransactionGroup {
  outputFile: string
  accountId: string
  accountName: string
  transactions: Transaction[]
  transactionIds: string[]
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
      const transaction = Transaction.fromJSON(processedTx.processedTransaction)

      const outputFile: string =
        (transaction.internalMetadata.outputFile as string | undefined) ||
        account.defaultOutputFile

      if (!groups.has(outputFile)) {
        groups.set(outputFile, {
          outputFile,
          accountId: account.id,
          accountName: account.name,
          transactions: [],
          transactionIds: [],
        })
      }

      const group = groups.get(outputFile)!
      group.transactions.push(transaction)
      group.transactionIds.push(processedTx.id)
    }
  }

  return Array.from(groups.values())
}
