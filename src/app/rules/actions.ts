'use server'

import { randomUUID } from 'node:crypto'
import { getDb } from '@/lib/db/db'
import { RuleSchema } from '@/lib/db/schema'
import type { Rule } from '@/lib/db/types'

export async function getRulesForAccount(
  accountId: string,
): Promise<{ rules: Rule[]; accountName: string } | null> {
  const db = await getDb()
  const account = db.data.config.accounts.find((a) => a.id === accountId)

  if (!account) {
    return null
  }

  return {
    rules: account.rules,
    accountName: account.name,
  }
}

export async function createRule(
  accountId: string,
  rule: Omit<Rule, 'id'>,
): Promise<{ message: string; success: boolean; ruleId?: string }> {
  try {
    const db = await getDb()
    const account = db.data.config.accounts.find((a) => a.id === accountId)

    if (!account) {
      return {
        message: 'Account not found',
        success: false,
      }
    }

    // Generate UUID for new rule
    const newRule: Rule = {
      ...rule,
      id: randomUUID(),
    }

    // Validate rule
    const result = RuleSchema.safeParse(newRule)
    if (!result.success) {
      return {
        message: result.error.issues[0]?.message || 'Invalid rule data',
        success: false,
      }
    }

    // Add rule to account
    account.rules.push(result.data)
    await db.write()

    return {
      message: 'Rule created successfully',
      success: true,
      ruleId: newRule.id,
    }
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : 'Failed to create rule',
      success: false,
    }
  }
}

export async function updateRule(
  accountId: string,
  ruleId: string,
  updates: Omit<Rule, 'id'>,
): Promise<{ message: string; success: boolean }> {
  try {
    const db = await getDb()
    const account = db.data.config.accounts.find((a) => a.id === accountId)

    if (!account) {
      return {
        message: 'Account not found',
        success: false,
      }
    }

    const ruleIndex = account.rules.findIndex((r) => r.id === ruleId)
    if (ruleIndex === -1) {
      return {
        message: 'Rule not found',
        success: false,
      }
    }

    // Create updated rule with existing ID
    const updatedRule: Rule = {
      ...updates,
      id: ruleId,
    }

    // Validate rule
    const result = RuleSchema.safeParse(updatedRule)
    if (!result.success) {
      return {
        message: result.error.issues[0]?.message || 'Invalid rule data',
        success: false,
      }
    }

    // Update rule
    account.rules[ruleIndex] = result.data
    await db.write()

    return {
      message: 'Rule updated successfully',
      success: true,
    }
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : 'Failed to update rule',
      success: false,
    }
  }
}

export async function deleteRule(
  accountId: string,
  ruleId: string,
): Promise<{ message: string; success: boolean }> {
  try {
    const db = await getDb()
    const account = db.data.config.accounts.find((a) => a.id === accountId)

    if (!account) {
      return {
        message: 'Account not found',
        success: false,
      }
    }

    const ruleIndex = account.rules.findIndex((r) => r.id === ruleId)
    if (ruleIndex === -1) {
      return {
        message: 'Rule not found',
        success: false,
      }
    }

    // Remove rule
    account.rules.splice(ruleIndex, 1)
    await db.write()

    return {
      message: 'Rule deleted successfully',
      success: true,
    }
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : 'Failed to delete rule',
      success: false,
    }
  }
}

export async function toggleRuleEnabled(
  accountId: string,
  ruleId: string,
): Promise<{ message: string; success: boolean; enabled?: boolean }> {
  try {
    const db = await getDb()
    const account = db.data.config.accounts.find((a) => a.id === accountId)

    if (!account) {
      return {
        message: 'Account not found',
        success: false,
      }
    }

    const rule = account.rules.find((r) => r.id === ruleId)
    if (!rule) {
      return {
        message: 'Rule not found',
        success: false,
      }
    }

    // Toggle enabled status
    rule.enabled = !rule.enabled
    await db.write()

    return {
      message: `Rule ${rule.enabled ? 'enabled' : 'disabled'} successfully`,
      success: true,
      enabled: rule.enabled,
    }
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : 'Failed to toggle rule',
      success: false,
    }
  }
}

export async function updateRulePriority(
  accountId: string,
  ruleId: string,
  newPriority: number,
): Promise<{ message: string; success: boolean }> {
  try {
    const db = await getDb()
    const account = db.data.config.accounts.find((a) => a.id === accountId)

    if (!account) {
      return {
        message: 'Account not found',
        success: false,
      }
    }

    const rule = account.rules.find((r) => r.id === ruleId)
    if (!rule) {
      return {
        message: 'Rule not found',
        success: false,
      }
    }

    // Update priority
    rule.priority = newPriority
    await db.write()

    return {
      message: 'Rule priority updated successfully',
      success: true,
    }
  } catch (error) {
    return {
      message:
        error instanceof Error
          ? error.message
          : 'Failed to update rule priority',
      success: false,
    }
  }
}
