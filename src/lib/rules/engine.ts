/**
 * Rule Engine - processes beancount transactions with rules
 *
 * This module provides the core functionality for:
 * - Matching transactions against selector expressions
 * - Validating amount expectations
 * - Applying transformation actions
 */

import { Entry, ParseResult, Transaction } from 'beancount'
import type { Rule } from '@/lib/db/types'

// Import from split modules (used in this file)
import { matchesSelector } from './selectors'
import { validateExpectations } from './validation'
import { applyAction } from './actions'

/**
 * Process a single transaction with all matching rules
 * Returns an array of resulting entries
 *
 * @param transaction - The transaction to process (not modified)
 * @param rules - The rules to apply
 * @param userVariables - Optional user-defined variables available for substitution
 */
export function processTransaction(
  transaction: Transaction,
  rules: Rule[],
  userVariables: Record<string, string> = {},
): {
  entries: Entry[]
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

  // Start with a clone of the input transaction
  let entries: Entry[] = [
    Transaction.fromJSON(JSON.stringify(transaction.toJSON())),
  ]

  // Filter enabled rules and sort by priority (higher = earlier)
  const enabledRules = rules
    .filter((rule) => rule.enabled)
    .sort((a, b) => b.priority - a.priority)

  for (const rule of enabledRules) {
    // Check if any entry matches the rule's selector
    // For now, we check the first entry (rules chain on results)
    const matchingEntry = entries[0] as Transaction
    if (!matchesSelector(matchingEntry, rule.selector)) {
      continue
    }

    // Validate expectations
    const ruleWarnings = validateExpectations(matchingEntry, rule)
    warnings.push(...ruleWarnings)

    // Apply all actions from this rule with fan-out
    const actionsApplied: string[] = []
    for (const action of rule.actions) {
      entries = entries.flatMap((entry) => {
        if (entry.type === 'transaction') {
          return applyAction(entry as Transaction, action, userVariables)
        }
        return entry
      })
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
    entries,
    matchedRules,
    warnings,
  }
}

/**
 * Apply a single rule to a transaction manually, bypassing selector matching
 * Returns an array of resulting entries and execution details
 *
 * @param transaction - The transaction to process (not modified)
 * @param rule - The rule to apply
 * @param userVariables - Optional user-defined variables available for substitution
 */
export function applyRuleManually(
  transaction: Transaction,
  rule: Rule,
  userVariables: Record<string, string> = {},
): {
  entries: Entry[]
  ruleId: string
  ruleName: string
  actionsApplied: string[]
  applicationType: 'manual'
  warnings: string[]
} {
  // Start with a clone of the input transaction
  let entries: Entry[] = [
    Transaction.fromJSON(JSON.stringify(transaction.toJSON())),
  ]

  // Validate expectations on the first entry
  const warnings = validateExpectations(entries[0] as Transaction, rule)

  // Apply all actions from this rule with fan-out
  const actionsApplied: string[] = []
  for (const action of rule.actions) {
    entries = entries.flatMap((entry) => {
      if (entry.type === 'transaction') {
        return applyAction(entry as Transaction, action, userVariables)
      }
      return entry
    })
    actionsApplied.push(action.type)
  }

  return {
    entries,
    ruleId: rule.id,
    ruleName: rule.name,
    actionsApplied,
    applicationType: 'manual',
    warnings,
  }
}

interface ExecutionDetail {
  transactionIndex: number
  transactionDate: string
  transactionNarration: string
  entries: Entry[]
  matchedRules: Array<{
    ruleId: string
    ruleName: string
    actionsApplied: string[]
    applicationType: 'automatic' | 'manual'
  }>
  warnings: string[]
}

/**
 * Process an entire import result with rules
 * Returns processed entries and execution details (does not modify input)
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
  executionDetails: ExecutionDetail[]
  statistics: {
    totalTransactions: number
    transactionsProcessed: number
    rulesApplied: number
    warningsGenerated: number
  }
} {
  const executionDetails: ExecutionDetail[] = []

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

    // Record execution details with processed entries
    executionDetails.push({
      transactionIndex: index,
      transactionDate: transaction.date.toString(),
      transactionNarration: transaction.narration ?? '',
      entries: result.entries,
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
