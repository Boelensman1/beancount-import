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

/**
 * Get merged user variables with full details (name, value, description)
 * Per-account variables override global variables with the same name
 *
 * @param accountId - The account ID to get variables for
 * @returns Array of { name, value, description } objects
 */
export async function getUserVariablesWithDescriptions(
  accountId: string,
): Promise<Array<{ name: string; value: string; description?: string }>> {
  const db = await getDb()

  // Get global variables
  const globalVars = db.data.variables?.global ?? []

  // Get account-specific variables
  const account = db.data.config.accounts.find((a) => a.id === accountId)
  const accountVars = account?.variables ?? []

  // Merge: global first, then account overrides (by name)
  const merged = new Map<
    string,
    { name: string; value: string; description?: string }
  >()

  for (const v of globalVars) {
    merged.set(v.name, {
      name: v.name,
      value: v.value,
      description: v.description,
    })
  }

  for (const v of accountVars) {
    merged.set(v.name, {
      name: v.name,
      value: v.value,
      description: v.description,
    })
  }

  return Array.from(merged.values())
}
