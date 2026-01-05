'use server'

import { randomUUID } from 'node:crypto'
import { getDb } from '@/lib/db/db'
import { ConfigSchema } from '@/lib/db/schema'
import { serializeGoCardlessConfig } from '@/lib/db/serialization'
import type { Account, SerializedConfig } from '@/lib/db/types'

export async function getSerializedConfig(): Promise<SerializedConfig> {
  const db = await getDb()
  return db.toJSON().config
}

export async function updateConfig(
  formData: FormData,
): Promise<{ message: string; success: boolean }> {
  try {
    const accountsJson = formData.get('accounts')
    const defaultsJson = formData.get('defaults')
    const goCardlessJson = formData.get('goCardless')

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
    let defaults: { beangulpCommand: string; postProcessCommand?: string }
    try {
      defaults = defaultsJson
        ? JSON.parse(defaultsJson as string)
        : { beangulpCommand: '' }
    } catch {
      return {
        message: 'Invalid defaults data format',
        success: false,
      }
    }

    // Parse goCardless from JSON string
    let goCardless: { secretId: string; secretKey: string } | undefined
    try {
      goCardless = goCardlessJson
        ? JSON.parse(goCardlessJson as string)
        : undefined
    } catch {
      return {
        message: 'Invalid GoCardless data format',
        success: false,
      }
    }

    // Get current database state
    const db = await getDb()
    const existingAccounts = db.data.config.accounts

    // Preserve existing IDs or generate new ones
    // Note: goCardless is serialized for validation, then parsed back to Temporal objects
    const accountsWithIds = accounts.map((account) => {
      // Find existing account by name to preserve its ID
      const existing = existingAccounts.find((a) => a.name === account.name)
      return {
        id: account.id ?? existing?.id ?? randomUUID(),
        name: account.name ?? '',
        defaultOutputFile: account.defaultOutputFile ?? '',
        csvFilename: account.csvFilename ?? '',
        beangulpCommand: account.beangulpCommand,
        postProcessCommand: account.postProcessCommand,
        csvPostProcessCommand: account.csvPostProcessCommand,
        rules: existing?.rules ?? [],
        variables: existing?.variables ?? [],
        // Preserve goCardless config, but allow reversePayee to be updated from form
        // Serialize Temporal objects before validation
        goCardless: existing?.goCardless
          ? serializeGoCardlessConfig({
              ...existing.goCardless,
              reversePayee:
                account.goCardless?.reversePayee ??
                existing.goCardless.reversePayee,
            })
          : undefined,
      }
    })

    // Validate input
    const result = ConfigSchema.safeParse({
      defaults,
      goCardless,
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
