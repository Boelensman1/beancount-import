import { parse, Blankline, Comment, Transaction, type Entry } from 'beancount'
import { readBeancountFile, fileExists } from './fileOperations'

export class FileMergeError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message)
    this.name = 'FileMergeError'
  }
}

interface MergeEntriesIntoFileOptions {
  addBlankLines?: boolean
  delimiterComment?: string
}

export async function mergeEntriesIntoFile(
  filePath: string,
  newEntries: Entry[],
  options: MergeEntriesIntoFileOptions = {},
): Promise<string> {
  let existingContent = ''

  if (await fileExists(filePath)) {
    try {
      existingContent = await readBeancountFile(filePath)
    } catch (error) {
      throw new FileMergeError(
        `Failed to read existing file ${filePath}`,
        error as Error,
      )
    }
  }

  let parseResult
  try {
    parseResult = parse(existingContent)
  } catch (error) {
    throw new FileMergeError(
      `Failed to parse existing file ${filePath}`,
      error as Error,
    )
  }

  // Entries are already in the correct order from rule processing
  // (comments stay with their associated transactions)

  if (
    options.addBlankLines &&
    parseResult.entries.length > 0 &&
    parseResult.entries[parseResult.entries.length - 1].type !== 'blankline'
  ) {
    parseResult.entries.push(new Blankline({}))
  }

  if (options.delimiterComment) {
    parseResult.entries.push(new Comment({ comment: options.delimiterComment }))
    if (options.addBlankLines) {
      parseResult.entries.push(new Blankline({}))
    }
  }

  // Add the entries to the result
  for (const entry of newEntries) {
    // Handle transactions marked for commenting out
    if (
      entry.type === 'transaction' &&
      (entry as Transaction).internalMetadata?.commentOut
    ) {
      const txString = entry.toFormattedString()
      for (const line of txString.split('\n')) {
        parseResult.entries.push(Comment.fromJSONData({ comment: `; ${line}` }))
      }
      if (options.addBlankLines) {
        parseResult.entries.push(new Blankline({}))
      }
    } else {
      parseResult.entries.push(entry)
      if (options.addBlankLines && entry.type === 'transaction') {
        // Only add blank line after transactions, not after comments
        parseResult.entries.push(new Blankline({}))
      }
    }
  }

  try {
    const currencyColumn = parseResult.calculateCurrencyColumn()
    return parseResult.toFormattedString({ currencyColumn })
  } catch (error) {
    console.error(error)
    throw new FileMergeError(`Failed to format merged content`, error as Error)
  }
}
