/**
 * Rule Engine - processes beancount transactions with rules
 *
 * This module provides the core functionality for:
 * - Matching transactions against selector expressions
 * - Validating amount expectations
 * - Applying transformation actions
 */

import {
  ParseResult,
  Transaction,
  Posting,
  Tag,
  Value,
  type ValueType,
} from 'beancount'
import type {
  Rule,
  SelectorExpression,
  Action,
  AccountSelector,
  NarrationSelector,
  PayeeSelector,
  AmountSelector,
  DateSelector,
  FlagSelector,
  TagSelector,
} from '@/lib/db/types'

/**
 * Helper function to convert a primitive value to a Value object
 */
function createValue(value: string | number | boolean): Value {
  let type: ValueType
  if (typeof value === 'string') {
    type = 'string'
  } else if (typeof value === 'boolean') {
    type = 'boolean'
  } else {
    type = 'numbers'
  }
  return new Value({ type, value })
}

/**
 * Check if a transaction matches a selector expression
 */
export function matchesSelector(
  transaction: Transaction,
  selector: SelectorExpression,
): boolean {
  switch (selector.type) {
    case 'and':
      return selector.conditions.every((condition) =>
        matchesSelector(transaction, condition),
      )

    case 'or':
      return selector.conditions.some((condition) =>
        matchesSelector(transaction, condition),
      )

    case 'not':
      return !matchesSelector(transaction, selector.condition)

    case 'account':
      return matchesAccountSelector(transaction, selector)

    case 'narration':
      return matchesNarrationSelector(transaction, selector)

    case 'payee':
      return matchesPayeeSelector(transaction, selector)

    case 'amount':
      return matchesAmountSelector(transaction, selector)

    case 'date':
      return matchesDateSelector(transaction, selector)

    case 'flag':
      return matchesFlagSelector(transaction, selector)

    case 'tag':
      return matchesTagSelector(transaction, selector)

    default:
      // Exhaustive check - TypeScript will error if we miss a case
      selector satisfies never
      return false
  }
}

/**
 * Match account selector against transaction postings
 */
function matchesAccountSelector(
  transaction: Transaction,
  selector: AccountSelector,
): boolean {
  if (!transaction.postings || transaction.postings.length === 0) {
    return false
  }

  return transaction.postings.some((posting) => {
    const account = posting.account || ''

    switch (selector.matchType) {
      case 'exact':
        return account === selector.pattern

      case 'glob': {
        // Convert glob to regex: * -> .*, ? -> .
        const globRegex = new RegExp(
          '^' +
            selector.pattern
              .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
              .replace(/\*/g, '.*') // * becomes .*
              .replace(/\?/g, '.') + // ? becomes .
            '$',
        )
        return globRegex.test(account)
      }

      case 'regex':
        try {
          const regex = new RegExp(selector.pattern)
          return regex.test(account)
        } catch {
          return false
        }

      default:
        return false
    }
  })
}

/**
 * Match narration selector
 */
function matchesNarrationSelector(
  transaction: Transaction,
  selector: NarrationSelector,
): boolean {
  const narration = transaction.narration || ''
  const caseSensitive = selector.caseSensitive ?? true

  const text = caseSensitive ? narration : narration.toLowerCase()
  const pattern = caseSensitive
    ? selector.pattern
    : selector.pattern.toLowerCase()

  switch (selector.matchType) {
    case 'exact':
      return text === pattern

    case 'substring':
      return text.includes(pattern)

    case 'regex':
      try {
        const flags = caseSensitive ? '' : 'i'
        const regex = new RegExp(selector.pattern, flags)
        return regex.test(narration)
      } catch {
        return false
      }

    default:
      return false
  }
}

/**
 * Match payee selector
 */
function matchesPayeeSelector(
  transaction: Transaction,
  selector: PayeeSelector,
): boolean {
  const payee = transaction.payee || ''
  const caseSensitive = selector.caseSensitive ?? true

  const text = caseSensitive ? payee : payee.toLowerCase()
  const pattern = caseSensitive
    ? selector.pattern
    : selector.pattern.toLowerCase()

  switch (selector.matchType) {
    case 'exact':
      return text === pattern

    case 'substring':
      return text.includes(pattern)

    case 'regex':
      try {
        const flags = caseSensitive ? '' : 'i'
        const regex = new RegExp(selector.pattern, flags)
        return regex.test(payee)
      } catch {
        return false
      }

    default:
      return false
  }
}

/**
 * Match amount selector against transaction postings
 */
function matchesAmountSelector(
  transaction: Transaction,
  selector: AmountSelector,
): boolean {
  if (!transaction.postings || transaction.postings.length === 0) {
    return false
  }

  return transaction.postings.some((posting) => {
    // Check currency filter if specified
    if (selector.currency && posting.currency !== selector.currency) {
      return false
    }

    const amount = parseFloat(posting.amount || '0')

    // Check min/max bounds
    if (selector.min !== undefined && amount < selector.min) {
      return false
    }

    if (selector.max !== undefined && amount > selector.max) {
      return false
    }

    return true
  })
}

/**
 * Match date selector
 */
function matchesDateSelector(
  transaction: Transaction,
  selector: DateSelector,
): boolean {
  if (!transaction.date) {
    return false
  }

  // Transaction date is Temporal.PlainDate, convert to ISO string for comparison
  const transactionDateStr = transaction.date.toString()

  if (selector.after) {
    if (transactionDateStr <= selector.after) {
      return false
    }
  }

  if (selector.before) {
    if (transactionDateStr >= selector.before) {
      return false
    }
  }

  return true
}

/**
 * Match flag selector
 */
function matchesFlagSelector(
  transaction: Transaction,
  selector: FlagSelector,
): boolean {
  return transaction.flag === selector.flag
}

/**
 * Match tag selector
 */
function matchesTagSelector(
  transaction: Transaction,
  selector: TagSelector,
): boolean {
  if (!transaction.tags || transaction.tags.length === 0) {
    return false
  }

  return transaction.tags.some((tag) => tag.content === selector.tag)
}

/**
 * Validate transaction against rule expectations
 * Returns array of warning messages if validation fails
 */
export function validateExpectations(
  transaction: Transaction,
  rule: Rule,
): string[] {
  const warnings: string[] = []

  if (!rule.expectations) {
    return warnings
  }

  const { minAmount, maxAmount, currency, warningMessage } = rule.expectations

  if (minAmount !== undefined || maxAmount !== undefined) {
    // Check each posting
    transaction.postings?.forEach((posting, index) => {
      // Filter by currency if specified
      if (currency && posting.currency !== currency) {
        return
      }

      const amount = parseFloat(posting.amount || '0')

      if (minAmount !== undefined && amount < minAmount) {
        warnings.push(
          warningMessage ||
            `Posting ${index + 1}: Amount ${amount} ${posting.currency} is below expected minimum ${minAmount}`,
        )
      }

      if (maxAmount !== undefined && amount > maxAmount) {
        warnings.push(
          warningMessage ||
            `Posting ${index + 1}: Amount ${amount} ${posting.currency} is above expected maximum ${maxAmount}`,
        )
      }
    })
  }

  return warnings
}

/**
 * Apply an action to a transaction
 * Modifies the transaction in-place
 */
export function applyAction(transaction: Transaction, action: Action): void {
  switch (action.type) {
    case 'modify_narration':
      transaction.narration = applyNarrationModification(
        transaction.narration || '',
        action,
      )
      break

    case 'modify_payee':
      transaction.payee = applyPayeeModification(transaction.payee, action)
      break

    case 'add_posting': {
      const newPosting = new Posting({
        account: action.account,
        amount:
          action.amount?.value === 'auto'
            ? undefined
            : String(action.amount?.value || ''),
        currency: action.amount?.currency || '',
      })
      transaction.postings.push(newPosting)
      break
    }

    case 'modify_posting':
      modifyPosting(transaction.postings, action)
      break

    case 'add_metadata': {
      if (!transaction.metadata) {
        transaction.metadata = {}
      }
      if (action.overwrite || !(action.key in transaction.metadata)) {
        transaction.metadata[action.key] = createValue(action.value)
      }
      break
    }

    case 'add_tag': {
      const tagExists = transaction.tags.some(
        (tag) => tag.content === action.tag,
      )
      if (!tagExists) {
        transaction.tags.push(
          new Tag({ content: action.tag, fromStack: false }),
        )
      }
      break
    }

    case 'add_link':
      if (!transaction.links.has(action.link)) {
        transaction.links.add(action.link)
      }
      break

    case 'add_comment': {
      // Comments are typically handled at the ParseResult level, not transaction level
      // For now, we'll store it in metadata
      if (!transaction.metadata) {
        transaction.metadata = {}
      }
      transaction.metadata[`_comment_${action.position}`] = createValue(
        action.comment,
      )
      break
    }

    case 'set_flag':
      transaction.flag = action.flag
      break

    default: {
      // Exhaustive check
      action satisfies never
      break
    }
  }
}

/**
 * Apply narration modification based on operation type
 */
function applyNarrationModification(
  narration: string,
  action: Extract<Action, { type: 'modify_narration' }>,
): string {
  switch (action.operation) {
    case 'replace':
      return action.value

    case 'prepend':
      return action.value + narration

    case 'append':
      return narration + action.value

    case 'regex_replace':
      if (!action.pattern) {
        return narration
      }
      try {
        const regex = new RegExp(action.pattern, 'g')
        return narration.replace(regex, action.value)
      } catch {
        return narration
      }

    default:
      return narration
  }
}

/**
 * Apply payee modification
 */
function applyPayeeModification(
  payee: string | undefined,
  action: Extract<Action, { type: 'modify_payee' }>,
): string {
  switch (action.operation) {
    case 'replace':
      return action.value

    case 'set_if_empty':
      return payee || action.value

    default:
      return payee || ''
  }
}

/**
 * Modify postings in-place
 */
function modifyPosting(
  postings: Posting[],
  action: Extract<Action, { type: 'modify_posting' }>,
): void {
  postings.forEach((posting, index) => {
    // Check if this posting matches the selector
    let matches = false

    if (action.selector.index !== undefined) {
      matches = index === action.selector.index
    } else if (action.selector.accountPattern) {
      try {
        const regex = new RegExp(action.selector.accountPattern)
        matches = regex.test(posting.account || '')
      } catch {
        matches = false
      }
    }

    if (!matches) {
      return
    }

    // Apply modifications to the posting object
    if (action.newAccount) {
      posting.account = action.newAccount
    }

    if (action.newAmount) {
      posting.amount = String(action.newAmount.value)
      posting.currency = action.newAmount.currency
    }
  })
}

/**
 * Process a single transaction with all matching rules
 * Modifies the transaction in-place and returns execution details
 */
export function processTransaction(
  transaction: Transaction,
  rules: Rule[],
): {
  matchedRules: Array<{
    ruleId: string
    ruleName: string
    actionsApplied: string[]
  }>
  warnings: string[]
} {
  const matchedRules: Array<{
    ruleId: string
    ruleName: string
    actionsApplied: string[]
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
      applyAction(transaction, action)
      actionsApplied.push(action.type)
    }

    matchedRules.push({
      ruleId: rule.id,
      ruleName: rule.name,
      actionsApplied,
    })
  }

  return {
    matchedRules,
    warnings,
  }
}

/**
 * Process an entire import result with rules
 * Modifies transactions in-place and returns execution details
 */
export function processImportWithRules(
  parseResult: ParseResult,
  rules: Rule[],
): {
  executionDetails: Array<{
    transactionIndex: number
    transactionDate: string
    transactionNarration: string
    matchedRules: Array<{
      ruleId: string
      ruleName: string
      actionsApplied: string[]
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
    const result = processTransaction(transaction, rules)

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
      transactionNarration: transaction.narration || '',
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
