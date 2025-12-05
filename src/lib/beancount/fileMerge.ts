import { Blankline, parse, Transaction } from 'beancount'
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

export async function mergeTransactionsIntoFile(
  filePath: string,
  newTransactions: Transaction[],
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
    parseResult = parse(existingContent, { skipBlanklines: false })
  } catch (error) {
    throw new FileMergeError(
      `Failed to parse existing file ${filePath}`,
      error as Error,
    )
  }

  // sort the new transactions
  newTransactions.sort((a, b) => {
    const aDate = (a as Transaction).date
    const bDate = (b as Transaction).date
    return aDate.toString().localeCompare(bDate.toString())
  })

  // add the transactions to the result
  for (const transaction of newTransactions) {
    parseResult.entries.push(transaction)
    // newline after eacht transaction
    parseResult.entries.push(new Blankline({}))
  }

  try {
    const currencyColumn = parseResult.calculateCurrencyColumn()
    return parseResult.toFormattedString({ currencyColumn })
  } catch (error) {
    console.error(error)
    throw new FileMergeError(`Failed to format merged content`, error as Error)
  }
}
