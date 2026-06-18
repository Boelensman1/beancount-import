import { Temporal } from '@js-temporal/polyfill'
import { Balance } from 'beancount'
import type { Account } from '@/lib/db/types'
import type {
  BalancesResponse,
  BookedTransaction,
} from '@/lib/goCardless/types'

type BalanceEntry = BalancesResponse['balances'][number]

const SUPPORTED_BALANCE_TYPE_PREFERENCE = [
  'interimBooked',
  'closingBooked',
  'expected',
  'interimAvailable',
] as const
const BEANCOUNT_ACCOUNT_NAME_PATTERN =
  /^(?:Assets|Liabilities|Equity|Income|Expenses)(?::[A-Z][A-Za-z0-9-]*)+$/

interface DecimalAmount {
  units: bigint
  scale: number
}

export interface SelectedBookedBalance {
  balance: BalanceEntry
  goCardlessAccountId: string
}

export interface GeneratedBalanceCheck {
  accountId: string
  accountName: string
  account: string
  date: string
  amount: string
  currency: string
  outputFile: string
  sourceReferenceDates: string[]
  sourceBalanceTypes: string[]
  sourceAccountIds: string[]
}

export interface GeneratedBalanceCheckNode extends GeneratedBalanceCheck {
  node: Balance
}

function parseDecimalAmount(amount: string): DecimalAmount {
  const match = amount.trim().match(/^([+-])?(\d+)(?:\.(\d+))?$/)
  if (!match) {
    throw new Error(`Invalid decimal amount: ${amount}`)
  }

  const sign = match[1] === '-' ? BigInt(-1) : BigInt(1)
  const integerPart = match[2]
  const fractionPart = match[3] ?? ''
  const scale = fractionPart.length
  const units = BigInt(`${integerPart}${fractionPart}`) * sign

  return { units, scale }
}

function formatDecimalAmount(amount: DecimalAmount): string {
  const sign = amount.units < BigInt(0) ? '-' : ''
  const absoluteUnits = amount.units < BigInt(0) ? -amount.units : amount.units

  if (amount.scale === 0) {
    return `${sign}${absoluteUnits.toString()}`
  }

  const padded = absoluteUnits.toString().padStart(amount.scale + 1, '0')
  const integerPart = padded.slice(0, -amount.scale)
  const fractionPart = padded.slice(-amount.scale)

  return `${sign}${integerPart}.${fractionPart}`
}

function alignDecimalAmount(amount: DecimalAmount, scale: number): bigint {
  return amount.units * BigInt(10) ** BigInt(scale - amount.scale)
}

export function addDecimalStrings(amounts: string[]): string {
  if (amounts.length === 0) {
    return '0'
  }

  const parsedAmounts = amounts.map(parseDecimalAmount)
  const scale = Math.max(...parsedAmounts.map((amount) => amount.scale))
  const units = parsedAmounts.reduce(
    (sum, amount) => sum + alignDecimalAmount(amount, scale),
    BigInt(0),
  )

  return formatDecimalAmount({ units, scale })
}

export function subtractDecimalStrings(
  minuend: string,
  subtrahend: string,
): string {
  const parsedSubtrahend = parseDecimalAmount(subtrahend)
  return addDecimalStrings([
    minuend,
    formatDecimalAmount({
      units: -parsedSubtrahend.units,
      scale: parsedSubtrahend.scale,
    }),
  ])
}

function compareReferenceDateDescending(a: BalanceEntry, b: BalanceEntry) {
  if (!a.referenceDate && !b.referenceDate) return 0
  if (!a.referenceDate) return 1
  if (!b.referenceDate) return -1

  return Temporal.PlainDate.compare(
    Temporal.PlainDate.from(b.referenceDate),
    Temporal.PlainDate.from(a.referenceDate),
  )
}

export function getSupportedBalanceTypes(): string[] {
  return [...SUPPORTED_BALANCE_TYPE_PREFERENCE]
}

export function getBalanceCheckAccount(account: Account): string {
  if (account.balanceCheckAccount) {
    if (BEANCOUNT_ACCOUNT_NAME_PATTERN.test(account.balanceCheckAccount)) {
      return account.balanceCheckAccount
    }

    throw new Error(
      `Balance Check Account for "${account.name}" must be a Beancount account like Assets:NL:Revolut.`,
    )
  }

  if (BEANCOUNT_ACCOUNT_NAME_PATTERN.test(account.name)) {
    return account.name
  }

  throw new Error(
    `Account "${account.name}" has no Balance Check Account configured. Configure a Beancount account like Assets:NL:Revolut.`,
  )
}

export function selectPreferredBalances(
  balances: BalanceEntry[],
): BalanceEntry[] {
  const supportedBalances = balances.filter((balance) =>
    SUPPORTED_BALANCE_TYPE_PREFERENCE.includes(
      balance.balanceType as (typeof SUPPORTED_BALANCE_TYPE_PREFERENCE)[number],
    ),
  )
  const currencies = [
    ...new Set(
      supportedBalances.map((balance) => balance.balanceAmount.currency),
    ),
  ]

  return currencies.flatMap((currency) => {
    for (const balanceType of SUPPORTED_BALANCE_TYPE_PREFERENCE) {
      const candidates = supportedBalances
        .filter(
          (balance) =>
            balance.balanceAmount.currency === currency &&
            balance.balanceType === balanceType,
        )
        .sort(compareReferenceDateDescending)

      if (candidates[0]) {
        return [candidates[0]]
      }
    }

    return []
  })
}

function isTransactionInAdjustmentWindow(
  transaction: BookedTransaction,
  sourceDate: Temporal.PlainDate,
  targetDate: Temporal.PlainDate,
): boolean {
  const bookingDate = Temporal.PlainDate.from(transaction.bookingDate)
  const compareSourceToTarget = Temporal.PlainDate.compare(
    sourceDate,
    targetDate,
  )

  if (compareSourceToTarget > 0) {
    return (
      Temporal.PlainDate.compare(bookingDate, targetDate) > 0 &&
      Temporal.PlainDate.compare(bookingDate, sourceDate) <= 0
    )
  }

  if (compareSourceToTarget < 0) {
    return (
      Temporal.PlainDate.compare(bookingDate, sourceDate) > 0 &&
      Temporal.PlainDate.compare(bookingDate, targetDate) <= 0
    )
  }

  return false
}

export function calculateTargetBalanceAmount(
  balance: BalanceEntry,
  targetDate: Temporal.PlainDate,
  adjustmentTransactions: BookedTransaction[],
  sourceDate = Temporal.PlainDate.from(balance.referenceDate ?? targetDate),
): string {
  const comparison = Temporal.PlainDate.compare(sourceDate, targetDate)

  if (comparison === 0) {
    return balance.balanceAmount.amount
  }

  const adjustmentAmount = addDecimalStrings(
    adjustmentTransactions
      .filter(
        (transaction) =>
          transaction.transactionAmount.currency ===
            balance.balanceAmount.currency &&
          isTransactionInAdjustmentWindow(transaction, sourceDate, targetDate),
      )
      .map((transaction) => transaction.transactionAmount.amount),
  )

  if (comparison > 0) {
    return subtractDecimalStrings(
      balance.balanceAmount.amount,
      adjustmentAmount,
    )
  }

  return addDecimalStrings([balance.balanceAmount.amount, adjustmentAmount])
}

export function buildBalanceCheckNodes(
  account: Account,
  targetDate: Temporal.PlainDate,
  selectedBalances: Array<{
    balance: BalanceEntry
    goCardlessAccountId: string
    amount: string
    sourceReferenceDate?: string
  }>,
): GeneratedBalanceCheckNode[] {
  const directiveDate = targetDate.add({ days: 1 })
  const byCurrency = new Map<
    string,
    Array<{
      balance: BalanceEntry
      goCardlessAccountId: string
      amount: string
      sourceReferenceDate?: string
    }>
  >()

  for (const selectedBalance of selectedBalances) {
    const currency = selectedBalance.balance.balanceAmount.currency
    byCurrency.set(currency, [
      ...(byCurrency.get(currency) ?? []),
      selectedBalance,
    ])
  }

  const beancountAccount = getBalanceCheckAccount(account)

  return Array.from(byCurrency.entries()).map(([currency, entries]) => {
    const amount = addDecimalStrings(entries.map((entry) => entry.amount))
    const node = new Balance({
      date: directiveDate,
      account: beancountAccount,
      amount,
      currency,
    })

    return {
      accountId: account.id,
      accountName: account.name,
      account: beancountAccount,
      date: directiveDate.toString(),
      amount,
      currency,
      outputFile: account.defaultOutputFile,
      sourceReferenceDates: [
        ...new Set(
          entries.map(
            (entry) =>
              entry.sourceReferenceDate ??
              entry.balance.referenceDate ??
              'unknown',
          ),
        ),
      ],
      sourceBalanceTypes: [
        ...new Set(entries.map((entry) => entry.balance.balanceType)),
      ],
      sourceAccountIds: [
        ...new Set(entries.map((entry) => entry.goCardlessAccountId)),
      ],
      node,
    }
  })
}

export function getDefaultBalanceTargetDate(): Temporal.PlainDate {
  return new Temporal.ZonedDateTime(
    Temporal.Now.instant().epochNanoseconds,
    Temporal.Now.timeZoneId(),
  )
    .subtract({ days: 1 })
    .toPlainDate()
}
