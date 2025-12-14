/**
 * Transaction Variables - builds variables from transaction data
 *
 * This module extracts variable values from transactions for use in
 * string replacement within rule actions.
 */

import { Transaction } from 'beancount'

/**
 * Build a variables object from transaction data for variable replacement
 * Returns a Record<string, string> with all available variables
 *
 * User-defined variables are included first, then transaction variables are added.
 * Transaction variables (like $narration, $postingAmount[0]) will override
 * user-defined variables with the same name.
 *
 * @param transaction - The transaction to extract variables from
 * @param userVariables - Optional user-defined variables to include
 */
export function buildVariablesFromTransaction(
  transaction: Transaction,
  userVariables: Record<string, string> = {},
): Record<string, string> {
  // Start with user-defined variables, transaction variables will override
  const variables: Record<string, string> = { ...userVariables }

  // Basic transaction fields
  variables.narration = transaction.narration ?? ''
  variables.payee = transaction.payee ?? ''
  variables.date = transaction.date.toString()
  variables.flag = transaction.flag ?? ''

  // Posting data with array indexing
  transaction.postings?.forEach((posting, index) => {
    const amount = posting.amount ?? ''
    variables[`postingAmount[${index}]`] = amount

    // Calculate absolute amount while preserving decimal places from input
    if (amount === '') {
      variables[`absolutePostingAmount[${index}]`] = ''
    } else {
      const parsed = parseFloat(amount)
      if (isNaN(parsed)) {
        variables[`absolutePostingAmount[${index}]`] = ''
      } else {
        // Detect decimal places in the original string
        // Remove negative sign first, then find decimal part
        const normalizedAmount = amount.trim().replace(/^-/, '')
        const decimalMatch = normalizedAmount.match(/\.(\d+)/)

        const absoluteValue = Math.abs(parsed)

        if (decimalMatch) {
          // Has decimal places - preserve them
          const decimalPlaces = decimalMatch[1].length
          variables[`absolutePostingAmount[${index}]`] =
            absoluteValue.toFixed(decimalPlaces)
        } else {
          // No decimal point - keep as integer
          variables[`absolutePostingAmount[${index}]`] =
            absoluteValue.toString()
        }
      }
    }

    // Calculate negated amount while preserving decimal places from input
    if (amount === '') {
      variables[`negatedPostingAmount[${index}]`] = ''
    } else {
      const parsed = parseFloat(amount)
      if (isNaN(parsed)) {
        variables[`negatedPostingAmount[${index}]`] = ''
      } else {
        // Negate the value
        const negatedValue = -parsed

        // Detect decimal places in the original string
        const normalizedAmount = amount.trim().replace(/^-/, '')
        const decimalMatch = normalizedAmount.match(/\.(\d+)/)

        if (decimalMatch) {
          // Has decimal places - preserve them
          const decimalPlaces = decimalMatch[1].length
          variables[`negatedPostingAmount[${index}]`] =
            negatedValue.toFixed(decimalPlaces)
        } else {
          // No decimal point - keep as integer
          variables[`negatedPostingAmount[${index}]`] = negatedValue.toString()
        }
      }
    }

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
