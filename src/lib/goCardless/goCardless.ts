import { Temporal } from '@js-temporal/polyfill'
import {
  type AuthResponse,
  type GoCardlessBank,
  type LinkCreationResponse,
  type TransactionsResponse,
  type BalancesResponse,
  type RequisitionGetResponse,
  GoCardlessError,
  AgreementGetResponse,
  Transaction,
  BookedTransaction,
} from './types'
import { getDb } from '@/lib/db/db'

// Module-level singleton instance
let instance: GoCardless | null = null

class GoCardless {
  secretId: string
  secretKey: string

  accessToken?: string
  refreshToken?: string
  accessTokenExpiration?: Date
  refreshTokenExpiration?: Date

  constructor(secretId: string, secretKey: string) {
    this.secretId = secretId
    this.secretKey = secretKey
  }

  private async sendRequest<T>(
    method: 'GET' | 'POST',
    url: string,
    options: {
      headers?: Record<string, string>
      body?: unknown
      searchParams?: Record<string, string>
    } = {},
    ignoreAuth: boolean = false,
  ): Promise<T> {
    if (!ignoreAuth) {
      await this.authIfNeeded()
    }

    // Build URL with search params
    const requestUrl = new URL(url)
    if (options.searchParams) {
      Object.entries(options.searchParams).forEach(([key, value]) => {
        requestUrl.searchParams.append(key, value)
      })
    }

    try {
      const response = await fetch(requestUrl, {
        method,
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
          ...(this.accessToken
            ? { Authorization: `Bearer ${this.accessToken}` }
            : {}),
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      })

      if (!response.ok) {
        const errorBody = await response.text()
        console.error('Error', errorBody)
        throw new GoCardlessError(
          `GoCardless API error: ${response.status} ${errorBody}`,
        )
      }

      return (await response.json()) as T
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('Request failed')
    }
  }

  public async auth() {
    const response = await this.sendRequest<AuthResponse>(
      'POST',
      'https://bankaccountdata.gocardless.com/api/v2/token/new/',
      {
        body: {
          secret_id: this.secretId,
          secret_key: this.secretKey,
        },
      },
      true,
    )

    this.accessToken = response.access
    this.refreshToken = response.refresh
    this.accessTokenExpiration = new Date(
      Date.now() + response.access_expires * 1000,
    )
    this.refreshTokenExpiration = new Date(
      Date.now() + response.refresh_expires * 1000,
    )
  }

  private async authIfNeeded() {
    if (!this.accessToken || new Date() >= this.accessTokenExpiration!) {
      await this.auth()
    }
  }

  public async getListOfBanks(countryCode: string): Promise<GoCardlessBank[]> {
    return this.sendRequest<GoCardlessBank[]>(
      'GET',
      `https://bankaccountdata.gocardless.com/api/v2/institutions/?country=${countryCode}`,
      {},
    )
  }

  public async getRequisitionRef(
    institutionId: string,
    callbackUrl: string,
  ): Promise<{ link: string }> {
    await this.authIfNeeded()

    const response = await this.sendRequest<LinkCreationResponse>(
      'POST',
      'https://bankaccountdata.gocardless.com/api/v2/requisitions/',
      {
        body: {
          redirect: callbackUrl,
          institution_id: institutionId,
        },
      },
    )

    return {
      link: response.link,
    }
  }

  public async listAccounts(reqRef: string): Promise<string[]> {
    const response = await this.sendRequest<RequisitionGetResponse>(
      'GET',
      `https://bankaccountdata.gocardless.com/api/v2/requisitions/${reqRef}/`,
      {},
    )

    return response.accounts
  }

  public async getAgreementExpiration(
    reqRef: string,
  ): Promise<Temporal.Instant> {
    const reqResponse = await this.sendRequest<RequisitionGetResponse>(
      'GET',
      `https://bankaccountdata.gocardless.com/api/v2/requisitions/${reqRef}/`,
      {},
    )

    const agreementId = reqResponse.agreement
    if (!agreementId) {
      throw new Error('No agreementId returned in getAgreementExpiration')
    }

    const agreementResponse = await this.sendRequest<AgreementGetResponse>(
      'GET',
      `https://bankaccountdata.gocardless.com/api/v2/agreements/enduser/${agreementId}/`,
      {},
    )

    const created = Temporal.Instant.from(
      agreementResponse.created,
    ).toZonedDateTimeISO('UTC')

    return created
      .add({ days: agreementResponse.access_valid_for_days })
      .toInstant()
  }

  private async listTransationsForAccount(
    accountId: string,
    dateFrom: Temporal.PlainDate,
    dateTo: Temporal.PlainDate,
  ): Promise<BookedTransaction[]> {
    await this.authIfNeeded()

    const response = await this.sendRequest<TransactionsResponse>(
      'GET',
      `https://bankaccountdata.gocardless.com/api/v2/accounts/${accountId}/transactions/`,
      {
        searchParams: {
          date_from: dateFrom.toString(),
          date_to: dateTo.toString(),
        },
      },
    )

    const transactions = response.transactions
    return transactions.booked
  }

  public async getTransationsForAccounts(
    accountIds: string[],
    dateFrom: Temporal.PlainDate,
    dateTo: Temporal.PlainDate,
    decimalsRound: number = 2,
  ): Promise<Transaction[]> {
    await this.authIfNeeded()

    const transactions = (
      await Promise.all(
        accountIds.map((accountId) =>
          this.listTransationsForAccount(accountId, dateFrom, dateTo),
        ),
      )
    ).flat()

    const filterOnWithinDateRange = (transaction: Transaction) =>
      Temporal.PlainDate.compare(transaction.bookingDate, dateFrom) > 0 &&
      Temporal.PlainDate.compare(transaction.bookingDate, dateTo) <= 0

    return transactions
      .map((transaction) => {
        let currency = transaction.transactionAmount.currency
        if (
          transaction.currencyExchange &&
          transaction.transactionAmount.currency !== 'EUR'
        ) {
          currency += ` @ ${1 / Number(transaction.currencyExchange.exchangeRate)} ${transaction.currencyExchange.sourceCurrency}`
        }
        return {
          id: transaction.transactionId,
          date: Temporal.PlainDate.from(
            transaction.valueDate ?? transaction.bookingDate,
          ), // valuedate is more precise for some banks, but not always given
          bookingDate: Temporal.PlainDate.from(transaction.bookingDate),
          amount: Number(transaction.transactionAmount.amount).toFixed(
            decimalsRound,
          ),
          currency,
          payee:
            Number(transaction.transactionAmount.amount) > 0
              ? transaction.debtorName
              : transaction.creditorName,
          narration:
            transaction.remittanceInformationUnstructured ??
            transaction.remittanceInformationUnstructuredArray?.join('\n'),
          bankTransactionCode:
            transaction.bankTransactionCode ??
            transaction.proprietaryBankTransactionCode,
        }
      })
      .filter((t) => filterOnWithinDateRange(t))
  }

  public async getBalances(
    accountId: string,
  ): Promise<BalancesResponse['balances']> {
    const response = await this.sendRequest<BalancesResponse>(
      'GET',
      `https://bankaccountdata.gocardless.com/api/v2/accounts/${accountId}/balances/`,
      {},
    )

    return response.balances
  }
}

/**
 * Get the GoCardless instance (singleton)
 * Initializes with credentials from database config on first call
 *
 * @returns Promise that resolves to the GoCardless instance
 */
export async function getGoCardless(): Promise<GoCardless> {
  if (instance) {
    return instance
  }

  const db = await getDb()

  if (!db.data.config.goCardless) {
    throw new Error(
      'GoCardless not configured. Please add goCardless config to the database.',
    )
  }

  const { secretId, secretKey } = db.data.config.goCardless

  if (!secretId || !secretKey) {
    throw new Error(
      'GoCardless credentials missing. Please configure secretId and secretKey in database.',
    )
  }

  instance = new GoCardless(secretId, secretKey)
  return instance
}

/**
 * Reset the GoCardless instance (useful for testing)
 */
export function resetGoCardless(): void {
  instance = null
}
