'use server'

import { randomUUID } from 'node:crypto'
import { getDb } from '@/lib/db/db'
import { ConfigSchema } from '@/lib/db/schema'
import type { Account, Config } from '@/lib/db/types'

export async function getConfig(): Promise<Config> {
  const db = await getDb()
  return db.data.config
}

export async function updateConfig(
  _prevState: { message: string; success: boolean } | null,
  formData: FormData,
): Promise<{ message: string; success: boolean }> {
  try {
    const accountsJson = formData.get('accounts')
    const defaultsJson = formData.get('defaults')

    // Parse accounts from JSON string
    let accounts: Partial<Account>[]
    try {
      accounts = accountsJson ? JSON.parse(accountsJson as string) : []
    } catch {
      return {
        message: 'Invalid accounts data format',
        success: false,
      }
    }

    // Parse defaults from JSON string
    let defaults: { postProcessCommand?: string }
    try {
      defaults = defaultsJson ? JSON.parse(defaultsJson as string) : {}
    } catch {
      return {
        message: 'Invalid defaults data format',
        success: false,
      }
    }

    // Get current database state
    const db = await getDb()
    const existingAccounts = db.data.config.accounts

    // Preserve existing IDs or generate new ones
    const accountsWithIds: Account[] = accounts.map((account) => {
      // Find existing account by name to preserve its ID
      const existing = existingAccounts.find((a) => a.name === account.name)
      return {
        id: existing?.id || randomUUID(),
        name: account.name || '',
        importerCommand: account.importerCommand || '',
        defaultOutputFile: account.defaultOutputFile || '',
        rules: existing?.rules || [],
      }
    })

    // Validate input
    const result = ConfigSchema.safeParse({
      defaults,
      accounts: accountsWithIds,
    })

    if (!result.success) {
      return {
        message: result.error.issues[0]?.message || 'Invalid input',
        success: false,
      }
    }

    // Find deleted account IDs
    const newAccountIds = new Set(accountsWithIds.map((a) => a.id))
    const deletedAccountIds = existingAccounts
      .map((a) => a.id)
      .filter((id) => !newAccountIds.has(id))

    // Cascade delete: remove imports for deleted accounts
    if (deletedAccountIds.length > 0) {
      db.data.imports = db.data.imports.filter(
        (importItem) => !deletedAccountIds.includes(importItem.accountId),
      )
    }

    // Update database config
    db.data.config = result.data
    await db.write()

    return {
      message: 'Config updated successfully!',
      success: true,
    }
  } catch (error) {
    return {
      message:
        error instanceof Error ? error.message : 'Failed to update config',
      success: false,
    }
  }
}
