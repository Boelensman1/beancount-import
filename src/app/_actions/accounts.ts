'use server'

import { getDb } from '@/lib/db/db'
import type { SerializedAccount } from '@/lib/db/types'

export async function getAccounts(): Promise<SerializedAccount[]> {
  const db = await getDb()
  return db.toJSON().config.accounts
}
