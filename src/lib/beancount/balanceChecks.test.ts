import { describe, expect, it } from 'vitest'
import { Temporal } from '@js-temporal/polyfill'
import {
  addDecimalStrings,
  buildBalanceCheckNodes,
  calculateTargetBalanceAmount,
  getBalanceCheckAccount,
  selectPreferredBalances,
} from './balanceChecks'
import type {
  BalancesResponse,
  BookedTransaction,
} from '@/lib/goCardless/types'
import type { Account } from '@/lib/db/types'

type BalanceEntry = BalancesResponse['balances'][number]

function balance(
  overrides: Partial<BalanceEntry> & {
    amount?: string
    currency?: string
    balanceType?: string
    referenceDate?: string
  },
): BalanceEntry {
  return {
    balanceAmount: {
      amount: overrides.amount ?? '100.00',
      currency: overrides.currency ?? 'EUR',
    },
    balanceType: overrides.balanceType ?? 'interimBooked',
    referenceDate: overrides.referenceDate ?? '2026-06-17',
    ...overrides,
  }
}

function bookedTransaction(
  overrides: Partial<BookedTransaction> & {
    amount?: string
    currency?: string
    bookingDate?: string
  },
): BookedTransaction {
  return {
    transactionId: 'tx-1',
    transactionAmount: {
      amount: overrides.amount ?? '10.00',
      currency: overrides.currency ?? 'EUR',
    },
    bookingDate: overrides.bookingDate ?? '2026-06-18',
    valueDate: overrides.bookingDate ?? '2026-06-18',
    ...overrides,
  }
}

describe('balanceChecks', () => {
  it('selects preferred supported balances per currency', () => {
    const selected = selectPreferredBalances([
      balance({
        amount: '100.00',
        currency: 'EUR',
        balanceType: 'closingBooked',
      }),
      balance({
        amount: '110.00',
        currency: 'EUR',
        balanceType: 'interimBooked',
      }),
      balance({
        amount: '50.00',
        currency: 'USD',
        balanceType: 'closingBooked',
      }),
      balance({
        amount: '999.00',
        currency: 'EUR',
        balanceType: 'interimAvailable',
      }),
    ])

    expect(selected).toHaveLength(2)
    expect(
      selected.find((item) => item.balanceAmount.currency === 'EUR'),
    ).toMatchObject({
      balanceAmount: { amount: '110.00', currency: 'EUR' },
      balanceType: 'interimBooked',
    })
    expect(
      selected.find((item) => item.balanceAmount.currency === 'USD'),
    ).toMatchObject({
      balanceAmount: { amount: '50.00', currency: 'USD' },
      balanceType: 'closingBooked',
    })
  })

  it('falls back to expected and interimAvailable balances', () => {
    const selected = selectPreferredBalances([
      balance({
        amount: '100.00',
        currency: 'EUR',
        balanceType: 'interimAvailable',
      }),
      balance({
        amount: '120.00',
        currency: 'EUR',
        balanceType: 'expected',
      }),
      balance({
        amount: '50.00',
        currency: 'USD',
        balanceType: 'interimAvailable',
      }),
    ])

    expect(selected).toHaveLength(2)
    expect(
      selected.find((item) => item.balanceAmount.currency === 'EUR'),
    ).toMatchObject({
      balanceAmount: { amount: '120.00', currency: 'EUR' },
      balanceType: 'expected',
    })
    expect(
      selected.find((item) => item.balanceAmount.currency === 'USD'),
    ).toMatchObject({
      balanceAmount: { amount: '50.00', currency: 'USD' },
      balanceType: 'interimAvailable',
    })
  })

  it('subtracts later booked transactions when rolling a newer balance back', () => {
    const amount = calculateTargetBalanceAmount(
      balance({ amount: '1000.00', referenceDate: '2026-06-18' }),
      Temporal.PlainDate.from('2026-06-17'),
      [
        bookedTransaction({ amount: '10.25', bookingDate: '2026-06-18' }),
        bookedTransaction({ amount: '-5.10', bookingDate: '2026-06-18' }),
        bookedTransaction({ amount: '2.00', bookingDate: '2026-06-17' }),
      ],
    )

    expect(amount).toBe('994.85')
  })

  it('adds later booked transactions when rolling an older balance forward', () => {
    const amount = calculateTargetBalanceAmount(
      balance({ amount: '1000.00', referenceDate: '2026-06-16' }),
      Temporal.PlainDate.from('2026-06-17'),
      [
        bookedTransaction({ amount: '10.25', bookingDate: '2026-06-17' }),
        bookedTransaction({ amount: '-5.10', bookingDate: '2026-06-17' }),
        bookedTransaction({ amount: '2.00', bookingDate: '2026-06-16' }),
      ],
    )

    expect(amount).toBe('1005.15')
  })

  it('uses exact decimal math when summing mixed scales', () => {
    expect(addDecimalStrings(['0.10', '0.20', '-0.005'])).toBe('0.295')
  })

  it('builds one balance node per currency and sums linked accounts', () => {
    const account: Account = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Checking display name',
      balanceCheckAccount: 'Assets:Checking',
      csvFilename: 'csv.csv',
      defaultOutputFile: '/tmp/checking.beancount',
      rules: [],
      variables: [],
    }

    const nodes = buildBalanceCheckNodes(
      account,
      Temporal.PlainDate.from('2026-06-17'),
      [
        {
          balance: balance({ amount: '100.00', currency: 'EUR' }),
          goCardlessAccountId: 'gc-1',
          amount: '100.00',
        },
        {
          balance: balance({ amount: '50.00', currency: 'EUR' }),
          goCardlessAccountId: 'gc-2',
          amount: '50.00',
        },
      ],
    )

    expect(nodes).toHaveLength(1)
    expect(nodes[0].amount).toBe('150.00')
    expect(nodes[0].accountName).toBe('Checking display name')
    expect(nodes[0].account).toBe('Assets:Checking')
    expect(nodes[0].node.toFormattedString()).toContain(
      '2026-06-18 balance Assets:Checking',
    )
  })

  it('uses the account name only when it is already a Beancount account', () => {
    const account: Account = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Assets:Checking',
      csvFilename: 'csv.csv',
      defaultOutputFile: '/tmp/checking.beancount',
      rules: [],
      variables: [],
    }

    expect(getBalanceCheckAccount(account)).toBe('Assets:Checking')
  })

  it('requires a balance check account for display-only account names', () => {
    const account: Account = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Checking display name',
      csvFilename: 'csv.csv',
      defaultOutputFile: '/tmp/checking.beancount',
      rules: [],
      variables: [],
    }

    expect(() => getBalanceCheckAccount(account)).toThrow(
      'has no Balance Check Account configured',
    )
  })
})
