/**
 * Actions - applies transformation actions to transactions
 *
 * This module handles all action types that can modify transactions:
 * narration, payee, postings, metadata, tags, links, comments, flags, and output files.
 */

import {
  Transaction,
  Posting,
  Tag,
  Value,
  Comment,
  type ValueType,
  Entry,
} from 'beancount'
import type { Action } from '@/lib/db/types'
import { replaceVariables } from '@/lib/string/replaceVariables'
import { buildVariablesFromTransaction } from './transaction-variables'

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
 * Apply an action to a transaction
 * Returns an array of transactions (currently always 1, but may be more for future actions like split)
 *
 * @param transaction - The input transaction (not modified)
 * @param action - The action to apply
 * @param userVariables - Optional user-defined variables available for substitution
 * @returns Array of entries resulting from the action
 */
export function applyAction(
  transaction: Transaction,
  action: Action,
  userVariables: Record<string, string> = {},
): Entry[] {
  // Clone to avoid in-place modification
  const tx = Transaction.fromJSON(JSON.stringify(transaction.toJSON()))

  // Build variables from transaction for replacement
  const variables = buildVariablesFromTransaction(tx, userVariables)

  switch (action.type) {
    case 'modify_narration':
      tx.narration = applyNarrationModification(
        tx.narration ?? '',
        action,
        variables,
      )
      break

    case 'modify_payee':
      tx.payee = applyPayeeModification(tx.payee, action, variables)
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
        currency: replaceVariables(action.amount?.currency ?? '', variables),
      })
      tx.postings.push(newPosting)
      break
    }

    case 'modify_posting':
      modifyPosting(tx.postings, action, variables)
      break

    case 'add_metadata': {
      tx.metadata ??= {}
      if (action.overwrite || !(action.key in tx.metadata)) {
        const value = replaceVariables(String(action.value), variables)
        tx.metadata[action.key] = createValue(value, action.value)
      }
      break
    }

    case 'add_tag': {
      const tag = replaceVariables(action.tag, variables)
      const tagExists = tx.tags.some((t) => t.content === tag)
      if (!tagExists) {
        tx.tags.push(new Tag({ content: tag, fromStack: false }))
      }
      break
    }

    case 'add_link': {
      const link = replaceVariables(action.link, variables)
      if (!tx.links.has(link)) {
        tx.links.add(link)
      }
      break
    }

    case 'add_comment': {
      const commentText = replaceVariables(action.comment, variables)
      const commentEntry = Comment.fromJSONData({ comment: commentText })
      // Copy outputFile from transaction to comment so they end up in the same file
      if (tx.internalMetadata.outputFile) {
        commentEntry.internalMetadata.outputFile =
          tx.internalMetadata.outputFile
      }
      switch (action.position) {
        case 'before':
          return [commentEntry, tx]
        case 'after':
          return [tx, commentEntry]
        default: {
          // Exhaustive check
          action.position satisfies never
          break
        }
      }
      break
    }

    case 'set_flag':
      tx.flag = action.flag
      break

    case 'set_output_file': {
      const outputFile = replaceVariables(action.outputFile, variables)
      tx.internalMetadata.outputFile = outputFile

      if (action.keepCommentedCopy) {
        // Create commented copy for original file (no outputFile = uses defaultOutputFile)
        const commentedEntries = createCommentedCopy(tx, outputFile)
        // Commented entries go first (original file), then the transaction (new file)
        return [...commentedEntries, tx]
      }
      break
    }

    default: {
      // Exhaustive check
      action satisfies never
      break
    }
  }

  return [tx]
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
      posting.currency = replaceVariables(action.newAmount.currency, variables)
    }
  })
}

/**
 * Creates a commented-out copy of a transaction for keeping in the original file.
 * The commented copy has NO outputFile set, so it falls back to defaultOutputFile.
 *
 * @param transaction - The transaction to create a commented copy of
 * @param movedToPath - The path where the actual transaction is being moved to
 * @returns Array of Comment entries representing the commented transaction
 */
function createCommentedCopy(
  transaction: Transaction,
  movedToPath: string,
): Comment[] {
  const comments: Comment[] = []

  // Add annotation line with "; " prefix for Beancount comment format
  comments.push(Comment.fromJSONData({ comment: `; Moved to: ${movedToPath}` }))

  // Get the formatted transaction string and comment out each line
  const txString = transaction.toFormattedString()
  for (const line of txString.split('\n')) {
    // Add "; " prefix to each line for Beancount comment format
    comments.push(Comment.fromJSONData({ comment: `; ${line}` }))
  }

  // Note: These comments have NO outputFile set, so they will
  // fall back to the account's defaultOutputFile in groupTransactionsByOutputFile()

  return comments
}
