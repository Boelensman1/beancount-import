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
import { replaceVariables } from '@/lib/string/replaceVariables'

/**
 * Helper function to convert a primitive value to a Value object
 */
function createValue(
  value: string | number | boolean,
  originalValue?: string | number | boolean,
): Value {
  let type: ValueType

  const valueToTypeCheck = originalValue ?? value
  switch (typeof valueToTypeCheck) {
    case 'string':
      type = 'string'
      break
    case 'boolean':
      type = 'boolean'
      break
    case 'number':
      type = 'numbers'
      break
    default:
      throw new Error(
        `Could not create value for value of type ${typeof valueToTypeCheck}`,
      )
  }
  return new Value({ type, value })
}

/**
 * Build a variables object from transaction data for variable replacement
 * Returns a Record<string, string> with all available variables
 */
export function buildVariablesFromTransaction(
  transaction: Transaction,
): Record<string, string> {
  const variables: Record<string, string> = {}

  // Basic transaction fields
  variables.narration = transaction.narration ?? ''
  variables.payee = transaction.payee ?? ''
  variables.date = transaction.date.toString()
  variables.flag = transaction.flag ?? ''

  // Posting data with array indexing
  transaction.postings?.forEach((posting, index) => {
    variables[`postingAmount[${index}]`] = posting.amount ?? ''
    variables[`postingAccount[${index}]`] = posting.account ?? ''
    variables[`postingCurrency[${index}]`] = posting.currency ?? ''
  })

  // Metadata with prefix
  if (transaction.metadata) {
    for (const [key, value] of Object.entries(transaction.metadata)) {
      // Convert Value object to string
      const stringValue =
        value.value === undefined || value.value === null
          ? ''
          : String(value.value)
      variables[`metadata_${key}`] = stringValue
    }
  }

  return variables
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
    const account = posting.account ?? ''

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
  const narration = transaction.narration ?? ''
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
  const payee = transaction.payee ?? ''
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

    const amount = parseFloat(posting.amount ?? '0')

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

  const { minAmount, maxAmount, currency } = rule.expectations

  if (minAmount !== undefined || maxAmount !== undefined) {
    // Check each posting
    transaction.postings?.forEach((posting, index) => {
      // Filter by currency if specified
      if (currency && posting.currency !== currency) {
        return
      }

      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const amount = parseFloat(posting.amount || '0')

      if (isNaN(amount)) {
        warnings.push(
          `Posting ${index + 1}: Amount is not a valid number (${posting.amount}), expressions are not (yet) supported.`,
        )
        return
      }

      if (minAmount !== undefined && amount < minAmount) {
        warnings.push(
          `Posting ${index + 1}: Amount ${amount} ${posting.currency} is below expected minimum ${minAmount}`,
        )
      }

      if (maxAmount !== undefined && amount > maxAmount) {
        warnings.push(
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
  // Build variables from transaction for replacement
  const variables = buildVariablesFromTransaction(transaction)

  switch (action.type) {
    case 'modify_narration':
      transaction.narration = applyNarrationModification(
        transaction.narration ?? '',
        action,
        variables,
      )
      break

    case 'modify_payee':
      transaction.payee = applyPayeeModification(
        transaction.payee,
        action,
        variables,
      )
      break

    case 'add_posting': {
      const account = replaceVariables(action.account, variables)
      const amount =
        action.amount?.value === 'auto'
          ? undefined
          : replaceVariables(String(action.amount?.value ?? ''), variables)

      const newPosting = new Posting({
        account,
        amount,
        currency: action.amount?.currency ?? '',
      })
      transaction.postings.push(newPosting)
      break
    }

    case 'modify_posting':
      modifyPosting(transaction.postings, action, variables)
      break

    case 'add_metadata': {
      transaction.metadata ??= {}
      if (action.overwrite || !(action.key in transaction.metadata)) {
        const value = replaceVariables(String(action.value), variables)
        transaction.metadata[action.key] = createValue(value, action.value)
      }
      break
    }

    case 'add_tag': {
      const tag = replaceVariables(action.tag, variables)
      const tagExists = transaction.tags.some((t) => t.content === tag)
      if (!tagExists) {
        transaction.tags.push(new Tag({ content: tag, fromStack: false }))
      }
      break
    }

    case 'add_link': {
      const link = replaceVariables(action.link, variables)
      if (!transaction.links.has(link)) {
        transaction.links.add(link)
      }
      break
    }

    case 'add_comment': {
      // Comments are typically handled at the ParseResult level, not transaction level
      // For now, we'll store it in metadata
      transaction.metadata ??= {}
      const comment = replaceVariables(action.comment, variables)
      transaction.metadata[`_comment_${action.position}`] = createValue(comment)
      break
    }

    case 'set_flag':
      transaction.flag = action.flag
      break

    case 'set_output_file': {
      const outputFile = replaceVariables(action.outputFile, variables)
      transaction.internalMetadata.outputFile = outputFile
      break
    }

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
  variables: Record<string, string>,
): string {
  const value = replaceVariables(action.value, variables)

  switch (action.operation) {
    case 'replace':
      return value

    case 'prepend':
      return value + narration

    case 'append':
      return narration + value

    case 'regex_replace':
      if (!action.pattern) {
        return narration
      }
      try {
        const regex = new RegExp(action.pattern, 'g')
        return narration.replace(regex, value)
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
  variables: Record<string, string>,
): string {
  const value = replaceVariables(action.value, variables)

  switch (action.operation) {
    case 'replace':
      return value

    case 'set_if_empty':
      return payee ? (payee.length === 0 ? value : payee) : value

    default:
      return payee ?? ''
  }
}

/**
 * Modify postings in-place
 */
function modifyPosting(
  postings: Posting[],
  action: Extract<Action, { type: 'modify_posting' }>,
  variables: Record<string, string>,
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
      posting.account = replaceVariables(action.newAccount, variables)
    }

    if (action.newAmount) {
      posting.amount = replaceVariables(
        String(action.newAmount.value),
        variables,
      )
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
      applyAction(transaction, action)
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
 */
export function applyRuleManually(
  transaction: Transaction,
  rule: Rule,
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
    applyAction(transaction, action)
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
