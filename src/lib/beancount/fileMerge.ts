import { parse, Blankline, Comment, Transaction, type Node } from 'beancount'
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

interface MergeNodesIntoFileOptions {
  addBlankLines?: boolean
  delimiterComment?: string
}

export async function mergeNodesIntoFile(
  filePath: string,
  newNodes: Node[],
  options: MergeNodesIntoFileOptions = {},
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

  // Nodes are already in the correct order from rule processing
  // (comments stay with their associated transactions)
  if (
    options.addBlankLines &&
    parseResult.nodes.length > 0 &&
    parseResult.nodes[parseResult.nodes.length - 1].type !== 'blankline'
  ) {
    parseResult.nodes.push(new Blankline({}))
  }

  if (options.delimiterComment) {
    parseResult.nodes.push(new Comment({ comment: options.delimiterComment }))
    if (options.addBlankLines) {
      parseResult.nodes.push(new Blankline({}))
    }
  }

  // Add the nodes to the result
  for (const node of newNodes) {
    // Handle transactions marked for commenting out
    if (
      node.type === 'transaction' &&
      (node as Transaction).internalMetadata?.commentOut
    ) {
      const txString = node.toFormattedString()
      for (const line of txString.split('\n')) {
        parseResult.nodes.push(Comment.fromJSONData({ comment: `; ${line}` }))
      }
      if (options.addBlankLines) {
        parseResult.nodes.push(new Blankline({}))
      }
    } else {
      parseResult.nodes.push(node)
      if (options.addBlankLines && node.type === 'transaction') {
        // Only add blank line after transactions, not after comments
        parseResult.nodes.push(new Blankline({}))
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
