'use server'

import { getDb } from '@/lib/db/db'
import type {
  SerializedAccount,
  AccountWithPendingStatus,
} from '@/lib/db/types'

export async function getAccounts(): Promise<SerializedAccount[]> {
  const db = await getDb()
  return db.toJSON().config.accounts
}

export async function getAccountsWithPendingImports(): Promise<
  AccountWithPendingStatus[]
> {
  const db = await getDb()
  const accounts = db.toJSON().config.accounts
  const pendingAccountIds = new Set(
    (db.data.imports ?? []).map((imp) => imp.accountId),
  )
  return accounts.map((account) => ({
    ...account,
    hasPendingImport: pendingAccountIds.has(account.id),
  }))
}
