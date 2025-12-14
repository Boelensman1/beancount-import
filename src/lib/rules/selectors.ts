/**
 * Selectors - matching transactions against selector expressions
 *
 * This module provides functions to check if transactions match various
 * selector criteria including account, narration, payee, amount, date, flag, and tag.
 */

import { Transaction } from 'beancount'
import type {
  SelectorExpression,
  AccountSelector,
  NarrationSelector,
  PayeeSelector,
  AmountSelector,
  DateSelector,
  FlagSelector,
  TagSelector,
} from '@/lib/db/types'

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

    case 'never':
      return false

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
