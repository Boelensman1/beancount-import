import type { Temporal } from '@js-temporal/polyfill'
import { replaceVariables } from '@/lib/string/replaceVariables'

/**
 * Build the CSV filename for an account using the account's `csvFilename`
 * template. The same filename is used for actual imports and for the
 * "Download test CSV" feature so the filename a parser sees during
 * development matches what it sees in production.
 */
export function buildCsvFilename(args: {
  template: string
  accountName: string
  importedFrom: Temporal.PlainDate
  importedTo: Temporal.PlainDate
}): string {
  return replaceVariables(args.template, {
    account: args.accountName,
    importedFrom: args.importedFrom.toString().replaceAll('-', ''),
    importedTo: args.importedTo.toString().replaceAll('-', ''),
  })
}
