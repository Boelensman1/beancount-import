/**
 * Rule Engine - processes beancount transactions with rules
 *
 * This module provides the core functionality for:
 * - Matching transactions against selector expressions
 * - Validating amount expectations
 * - Applying transformation actions
 */

import { ParseResult, Transaction } from 'beancount'
import type { Rule } from '@/lib/db/types'

// Import from split modules (used in this file)
import { matchesSelector } from './selectors'
import { validateExpectations } from './validation'
import { applyAction } from './actions'

/**
 * Process a single transaction with all matching rules
 * Modifies the transaction in-place and returns execution details
 *
 * @param transaction - The transaction to process
 * @param rules - The rules to apply
 * @param userVariables - Optional user-defined variables available for substitution
 */
export function processTransaction(
  transaction: Transaction,
  rules: Rule[],
  userVariables: Record<string, string> = {},
): {
  matchedRules: Array<{
    ruleId: string
    ruleName: string
    actionsApplied: string[]
    applicationType: 'automatic' | 'manual'
  }>
  warnings: string[]
} {
  const matchedRules: Array<{
    ruleId: string
    ruleName: string
    actionsApplied: string[]
    applicationType: 'automatic' | 'manual'
  }> = []
  const warnings: string[] = []

  // Filter enabled rules and sort by priority (higher = earlier)
  const enabledRules = rules
    .filter((rule) => rule.enabled)
    .sort((a, b) => b.priority - a.priority)

  for (const rule of enabledRules) {
    // Check if transaction matches the rule's selector
    if (!matchesSelector(transaction, rule.selector)) {
      continue
    }

    // Validate expectations
    const ruleWarnings = validateExpectations(transaction, rule)
    warnings.push(...ruleWarnings)

    // Apply all actions from this rule (modifies transaction in-place)
    const actionsApplied: string[] = []
    for (const action of rule.actions) {
      applyAction(transaction, action, userVariables)
      actionsApplied.push(action.type)
    }

    matchedRules.push({
      ruleId: rule.id,
      ruleName: rule.name,
      actionsApplied,
      applicationType: 'automatic',
    })
  }

  return {
    matchedRules,
    warnings,
  }
}

/**
 * Apply a single rule to a transaction manually, bypassing selector matching
 * Returns the execution details to be added to matchedRules
 *
 * @param transaction - The transaction to modify
 * @param rule - The rule to apply
 * @param userVariables - Optional user-defined variables available for substitution
 */
export function applyRuleManually(
  transaction: Transaction,
  rule: Rule,
  userVariables: Record<string, string> = {},
): {
  ruleId: string
  ruleName: string
  actionsApplied: string[]
  applicationType: 'manual'
  warnings: string[]
} {
  // Validate expectations
  const warnings = validateExpectations(transaction, rule)

  // Apply all actions from this rule
  const actionsApplied: string[] = []
  for (const action of rule.actions) {
    applyAction(transaction, action, userVariables)
    actionsApplied.push(action.type)
  }

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    actionsApplied,
    applicationType: 'manual',
    warnings,
  }
}

/**
 * Process an entire import result with rules
 * Modifies transactions in-place and returns execution details
 *
 * @param parseResult - The parse result containing transactions
 * @param rules - The rules to apply
 * @param userVariables - Optional user-defined variables available for substitution
 */
export function processImportWithRules(
  parseResult: ParseResult,
  rules: Rule[],
  userVariables: Record<string, string> = {},
): {
  executionDetails: Array<{
    transactionIndex: number
    transactionDate: string
    transactionNarration: string
    matchedRules: Array<{
      ruleId: string
      ruleName: string
      actionsApplied: string[]
      applicationType: 'automatic' | 'manual'
    }>
    warnings: string[]
  }>
  statistics: {
    totalTransactions: number
    transactionsProcessed: number
    rulesApplied: number
    warningsGenerated: number
  }
} {
  const executionDetails: Array<{
    transactionIndex: number
    transactionDate: string
    transactionNarration: string
    matchedRules: Array<{
      ruleId: string
      ruleName: string
      actionsApplied: string[]
      applicationType: 'automatic' | 'manual'
    }>
    warnings: string[]
  }> = []

  let totalTransactionsProcessed = 0
  let totalRulesApplied = 0
  let totalWarnings = 0

  // Process each entry in the parse result
  parseResult.entries.forEach((entry, index) => {
    // Only process transaction entries
    if (entry.type !== 'transaction') {
      return
    }

    const transaction = entry as Transaction
    const result = processTransaction(transaction, rules, userVariables)

    // Track statistics
    if (result.matchedRules.length > 0) {
      totalTransactionsProcessed++
      totalRulesApplied += result.matchedRules.length
    }
    totalWarnings += result.warnings.length

    // Record execution details (transaction was modified in-place)
    executionDetails.push({
      transactionIndex: index,
      transactionDate: transaction.date.toString(),
      transactionNarration: transaction.narration ?? '',
      matchedRules: result.matchedRules,
      warnings: result.warnings,
    })
  })

  const totalTransactions = parseResult.entries.filter(
    (e) => e.type === 'transaction',
  ).length

  return {
    executionDetails,
    statistics: {
      totalTransactions,
      transactionsProcessed: totalTransactionsProcessed,
      rulesApplied: totalRulesApplied,
      warningsGenerated: totalWarnings,
    },
  }
}
