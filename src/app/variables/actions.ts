'use server'

import { randomUUID } from 'node:crypto'
import { getDb } from '@/lib/db/db'
import { UserVariableSchema } from '@/lib/db/schema'
import type { UserVariable } from '@/lib/db/types'

// ============================================================================
// Global Variable Actions
// ============================================================================

export async function getGlobalVariables(): Promise<UserVariable[]> {
  const db = await getDb()
  return db.data.variables?.global ?? []
}

export async function createGlobalVariable(
  variable: Omit<UserVariable, 'id'>,
): Promise<{ message: string; success: boolean; variableId?: string }> {
  try {
    const db = await getDb()

    // Initialize variables if needed
    if (!db.data.variables) {
      db.data.variables = { global: [] }
    }

    // Check for duplicate name
    const existingVar = db.data.variables.global.find(
      (v) => v.name === variable.name,
    )
    if (existingVar) {
      return {
        message: `A global variable with name "${variable.name}" already exists`,
        success: false,
      }
    }

    // Generate UUID for new variable
    const newVariable: UserVariable = {
      ...variable,
      id: randomUUID(),
    }

    // Validate variable
    const result = UserVariableSchema.safeParse(newVariable)
    if (!result.success) {
      return {
        message: result.error.issues[0]?.message || 'Invalid variable data',
        success: false,
      }
    }

    // Add variable
    db.data.variables.global.push(result.data)
    await db.write()

    return {
      message: 'Variable created successfully',
      success: true,
      variableId: newVariable.id,
    }
  } catch (error) {
    return {
      message:
        error instanceof Error ? error.message : 'Failed to create variable',
      success: false,
    }
  }
}

export async function updateGlobalVariable(
  variableId: string,
  updates: Omit<UserVariable, 'id'>,
): Promise<{ message: string; success: boolean }> {
  try {
    const db = await getDb()

    if (!db.data.variables) {
      return {
        message: 'No variables found',
        success: false,
      }
    }

    const variableIndex = db.data.variables.global.findIndex(
      (v) => v.id === variableId,
    )
    if (variableIndex === -1) {
      return {
        message: 'Variable not found',
        success: false,
      }
    }

    // Check for duplicate name (excluding current variable)
    const existingVar = db.data.variables.global.find(
      (v) => v.name === updates.name && v.id !== variableId,
    )
    if (existingVar) {
      return {
        message: `A global variable with name "${updates.name}" already exists`,
        success: false,
      }
    }

    // Create updated variable with existing ID
    const updatedVariable: UserVariable = {
      ...updates,
      id: variableId,
    }

    // Validate variable
    const result = UserVariableSchema.safeParse(updatedVariable)
    if (!result.success) {
      return {
        message: result.error.issues[0]?.message || 'Invalid variable data',
        success: false,
      }
    }

    // Update variable
    db.data.variables.global[variableIndex] = result.data
    await db.write()

    return {
      message: 'Variable updated successfully',
      success: true,
    }
  } catch (error) {
    return {
      message:
        error instanceof Error ? error.message : 'Failed to update variable',
      success: false,
    }
  }
}

export async function deleteGlobalVariable(
  variableId: string,
): Promise<{ message: string; success: boolean }> {
  try {
    const db = await getDb()

    if (!db.data.variables) {
      return {
        message: 'No variables found',
        success: false,
      }
    }

    const variableIndex = db.data.variables.global.findIndex(
      (v) => v.id === variableId,
    )
    if (variableIndex === -1) {
      return {
        message: 'Variable not found',
        success: false,
      }
    }

    // Remove variable
    db.data.variables.global.splice(variableIndex, 1)
    await db.write()

    return {
      message: 'Variable deleted successfully',
      success: true,
    }
  } catch (error) {
    return {
      message:
        error instanceof Error ? error.message : 'Failed to delete variable',
      success: false,
    }
  }
}

// ============================================================================
// Account Variable Actions
// ============================================================================

export async function getAccountVariables(
  accountId: string,
): Promise<{ variables: UserVariable[]; accountName: string } | null> {
  const db = await getDb()
  const account = db.data.config.accounts.find((a) => a.id === accountId)

  if (!account) {
    return null
  }

  return {
    variables: account.variables ?? [],
    accountName: account.name,
  }
}

export async function createAccountVariable(
  accountId: string,
  variable: Omit<UserVariable, 'id'>,
): Promise<{ message: string; success: boolean; variableId?: string }> {
  try {
    const db = await getDb()
    const account = db.data.config.accounts.find((a) => a.id === accountId)

    if (!account) {
      return {
        message: 'Account not found',
        success: false,
      }
    }

    // Initialize variables array if needed
    if (!account.variables) {
      account.variables = []
    }

    // Check for duplicate name within this account
    const existingVar = account.variables.find((v) => v.name === variable.name)
    if (existingVar) {
      return {
        message: `A variable with name "${variable.name}" already exists for this account`,
        success: false,
      }
    }

    // Generate UUID for new variable
    const newVariable: UserVariable = {
      ...variable,
      id: randomUUID(),
    }

    // Validate variable
    const result = UserVariableSchema.safeParse(newVariable)
    if (!result.success) {
      return {
        message: result.error.issues[0]?.message || 'Invalid variable data',
        success: false,
      }
    }

    // Add variable to account
    account.variables.push(result.data)
    await db.write()

    return {
      message: 'Variable created successfully',
      success: true,
      variableId: newVariable.id,
    }
  } catch (error) {
    return {
      message:
        error instanceof Error ? error.message : 'Failed to create variable',
      success: false,
    }
  }
}

export async function updateAccountVariable(
  accountId: string,
  variableId: string,
  updates: Omit<UserVariable, 'id'>,
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

    if (!account.variables) {
      return {
        message: 'No variables found for this account',
        success: false,
      }
    }

    const variableIndex = account.variables.findIndex(
      (v) => v.id === variableId,
    )
    if (variableIndex === -1) {
      return {
        message: 'Variable not found',
        success: false,
      }
    }

    // Check for duplicate name (excluding current variable)
    const existingVar = account.variables.find(
      (v) => v.name === updates.name && v.id !== variableId,
    )
    if (existingVar) {
      return {
        message: `A variable with name "${updates.name}" already exists for this account`,
        success: false,
      }
    }

    // Create updated variable with existing ID
    const updatedVariable: UserVariable = {
      ...updates,
      id: variableId,
    }

    // Validate variable
    const result = UserVariableSchema.safeParse(updatedVariable)
    if (!result.success) {
      return {
        message: result.error.issues[0]?.message || 'Invalid variable data',
        success: false,
      }
    }

    // Update variable
    account.variables[variableIndex] = result.data
    await db.write()

    return {
      message: 'Variable updated successfully',
      success: true,
    }
  } catch (error) {
    return {
      message:
        error instanceof Error ? error.message : 'Failed to update variable',
      success: false,
    }
  }
}

export async function deleteAccountVariable(
  accountId: string,
  variableId: string,
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

    if (!account.variables) {
      return {
        message: 'No variables found for this account',
        success: false,
      }
    }

    const variableIndex = account.variables.findIndex(
      (v) => v.id === variableId,
    )
    if (variableIndex === -1) {
      return {
        message: 'Variable not found',
        success: false,
      }
    }

    // Remove variable
    account.variables.splice(variableIndex, 1)
    await db.write()

    return {
      message: 'Variable deleted successfully',
      success: true,
    }
  } catch (error) {
    return {
      message:
        error instanceof Error ? error.message : 'Failed to delete variable',
      success: false,
    }
  }
}
