/**
 * Validation - validates transactions against rule expectations
 *
 * This module checks if transaction amounts fall within expected ranges
 * and generates warnings when they don't.
 */

import { Transaction } from 'beancount'
import type { Rule } from '@/lib/db/types'

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
