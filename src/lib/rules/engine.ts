/**
 * Rule Engine - processes beancount transactions with rules
 *
 * This module provides the core functionality for:
 * - Matching transactions against selector expressions
 * - Validating amount expectations
 * - Applying transformation actions
 */

import { Node, ParseResult, Transaction } from 'beancount'
import type { Action, ActionTarget, Rule } from '@/lib/db/types'

// Import from split modules (used in this file)
import { matchesSelector } from './selectors'
import { validateExpectations } from './validation'
import { applyAction } from './actions'

/**
 * Pick the positions in `nodes` that an action's target selects.
 *
 * @param transactionPositions - Positions of the transaction nodes, in order
 * @param target - The action's target (undefined means every transaction)
 * @param actionType - Only used to make the out-of-range warning readable
 * @param warnings - Collects a warning when the target selects nothing
 */
function selectTargetPositions(
  transactionPositions: number[],
  target: ActionTarget | undefined,
  actionType: string,
  warnings: string[],
): Set<number> {
  if (!target || target.mode === 'all') {
    return new Set(transactionPositions)
  }

  switch (target.mode) {
    case 'first':
      return new Set(transactionPositions.slice(0, 1))

    case 'last':
      return new Set(transactionPositions.slice(-1))

    case 'index': {
      const index = target.index ?? 0
      const position = transactionPositions[index]
      if (position === undefined) {
        warnings.push(
          `Action "${actionType}" targets transaction #${index} but only ${transactionPositions.length} transaction(s) are available - action skipped`,
        )
        return new Set()
      }
      return new Set([position])
    }

    default: {
      // Exhaustive check
      target.mode satisfies never
      return new Set(transactionPositions)
    }
  }
}

/**
 * Apply one action to the transaction nodes its target selects.
 *
 * Non-transaction nodes (comments, blank lines inserted by earlier actions) are
 * always passed through untouched, and the target counts only transaction nodes -
 * so 'first', 'last' and '#N' stay stable no matter what an earlier action inserted.
 */
function applyActionToNodes(
  nodes: Node[],
  action: Action,
  userVariables: Record<string, string>,
  warnings: string[],
): Node[] {
  const transactionPositions = nodes.flatMap((node, position) =>
    node.type === 'transaction' ? [position] : [],
  )
  const targetPositions = selectTargetPositions(
    transactionPositions,
    action.target,
    action.type,
    warnings,
  )

  return nodes.flatMap((node, position) => {
    if (node.type === 'transaction' && targetPositions.has(position)) {
      return applyAction(node as Transaction, action, userVariables)
    }
    return [node]
  })
}

/**
 * Process a single transaction with all matching rules
 * Returns an array of resulting nodes
 *
 * @param transaction - The transaction to process (not modified)
 * @param rules - The rules to apply
 * @param userVariables - Optional user-defined variables available for substitution
 * @param skippedRuleIds - Optional array of rule IDs to skip
 */
export function processTransaction(
  transaction: Transaction,
  rules: Rule[],
  userVariables: Record<string, string> = {},
  skippedRuleIds: string[] = [],
): {
  nodes: Node[]
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
  let nodes: Node[] = [
    Transaction.fromJSON(JSON.stringify(transaction.toJSON())),
  ]

  // Filter enabled rules, exclude skipped rules, and sort by priority (higher = earlier)
  const skippedSet = new Set(skippedRuleIds)
  const enabledRules = rules
    .filter((rule) => rule.enabled && !skippedSet.has(rule.id))
    .sort((a, b) => b.priority - a.priority)

  for (const rule of enabledRules) {
    // Check if any node matches the rule's selector
    // For now, we check the first node (rules chain on results)
    const matchingNode = nodes[0] as Transaction
    if (!matchesSelector(matchingNode, rule.selector)) {
      continue
    }

    // Validate expectations
    const ruleWarnings = validateExpectations(matchingNode, rule)
    warnings.push(...ruleWarnings)

    // Apply all actions from this rule with fan-out
    const actionsApplied: string[] = []
    for (const action of rule.actions) {
      nodes = applyActionToNodes(nodes, action, userVariables, warnings)
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
    nodes: nodes,
    matchedRules,
    warnings,
  }
}

/**
 * Apply a single rule to a transaction manually, bypassing selector matching
 * Returns an array of resulting nodes and execution details
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
  nodes: Node[]
  ruleId: string
  ruleName: string
  actionsApplied: string[]
  applicationType: 'manual'
  warnings: string[]
} {
  // Start with a clone of the input transaction
  let nodes: Node[] = [
    Transaction.fromJSON(JSON.stringify(transaction.toJSON())),
  ]

  // Validate expectations on the first node
  const warnings = validateExpectations(nodes[0] as Transaction, rule)

  // Apply all actions from this rule with fan-out
  const actionsApplied: string[] = []
  for (const action of rule.actions) {
    nodes = applyActionToNodes(nodes, action, userVariables, warnings)
    actionsApplied.push(action.type)
  }

  return {
    nodes: nodes,
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
  nodes: Node[]
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
 * Returns processed nodes and execution details (does not modify input)
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

  // Process each node in the parse result
  parseResult.nodes.forEach((node, index) => {
    // Only process transaction nodes
    if (node.type !== 'transaction') {
      return
    }

    const transaction = node as Transaction
    const result = processTransaction(transaction, rules, userVariables)

    // Track statistics
    if (result.matchedRules.length > 0) {
      totalTransactionsProcessed++
      totalRulesApplied += result.matchedRules.length
    }
    totalWarnings += result.warnings.length

    // Record execution details with processed nodes
    executionDetails.push({
      transactionIndex: index,
      transactionDate: transaction.date.toString(),
      transactionNarration: transaction.narration ?? '',
      nodes: result.nodes,
      matchedRules: result.matchedRules,
      warnings: result.warnings,
    })
  })

  const totalTransactions = parseResult.nodes.filter(
    (n) => n.type === 'transaction',
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
