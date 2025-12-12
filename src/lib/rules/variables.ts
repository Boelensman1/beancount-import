/**
 * User-defined variables helper
 *
 * Provides utilities for loading and merging user-defined variables
 * from global and account-level scopes.
 */

import { getDb } from '@/lib/db/db'

/**
 * Get merged user variables for an account
 * Per-account variables override global variables with the same name
 *
 * @param accountId - The account ID to get variables for
 * @returns Record of variable name to value
 */
export async function getUserVariablesForAccount(
  accountId: string,
): Promise<Record<string, string>> {
  const db = await getDb()

  // Get global variables
  const globalVars = db.data.variables?.global ?? []

  // Get account-specific variables
  const account = db.data.config.accounts.find((a) => a.id === accountId)
  const accountVars = account?.variables ?? []

  // Merge: global first, then account overrides
  const result: Record<string, string> = {}

  for (const v of globalVars) {
    result[v.name] = v.value
  }

  for (const v of accountVars) {
    result[v.name] = v.value
  }

  return result
}

/**
 * Get all global variables
 *
 * @returns Record of variable name to value
 */
export async function getGlobalUserVariables(): Promise<
  Record<string, string>
> {
  const db = await getDb()

  const globalVars = db.data.variables?.global ?? []

  const result: Record<string, string> = {}
  for (const v of globalVars) {
    result[v.name] = v.value
  }

  return result
}
