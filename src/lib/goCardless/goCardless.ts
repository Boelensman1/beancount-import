import crypto from 'crypto'
import { Temporal } from '@js-temporal/polyfill'
import {
  type AuthResponse,
  type GoCardlessBank,
  type LinkCreationResponse,
  type AccountListResponse,
  type BookedTransaction,
  type TransactionsResponse,
  type BalancesResponse,
  GoCardlessError,
} from './types'
import { getDb } from '@/lib/db/db'

// Module-level singleton instance
let instance: GoCardless | null = null

// Module-level pending OAuth callbacks
const pendingCallbacks = new Map<
  string,
  {
    resolve: (ref: string) => void
    reject: (error: Error) => void
    timeout: NodeJS.Timeout
  }
>()

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
  ): Promise<{ link: string; refPromise: Promise<string> }> {
    await this.authIfNeeded()

    const callbackId = crypto.randomUUID()
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:4101'
    const callbackUrl = `${baseUrl}/api/oauth/gocardless/callback?callbackId=${callbackId}`

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

    // Create promise that resolves when callback arrives
    const refPromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(
        () => {
          pendingCallbacks.delete(callbackId)
          reject(new Error('OAuth callback timeout after 5 minutes'))
        },
        5 * 60 * 1000,
      ) // 5 minute timeout

      pendingCallbacks.set(callbackId, { resolve, reject, timeout })
    })

    return {
      link: response.link,
      refPromise,
    }
  }

  public async listAccounts(reqRef: string): Promise<string[]> {
    const response = await this.sendRequest<AccountListResponse>(
      'GET',
      `https://bankaccountdata.gocardless.com/api/v2/requisitions/${reqRef}/`,
      {},
    )

    return response.accounts
  }

  public async listTransations(
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

    const filterOnWithinDateRange = (transaction: BookedTransaction) =>
      Temporal.PlainDate.from(transaction.bookingDate) >= dateFrom &&
      Temporal.PlainDate.from(transaction.bookingDate) <= dateTo

    return transactions.booked.filter((t) => filterOnWithinDateRange(t))
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

/**
 * Resolve an OAuth callback
 * Called by the API route when the OAuth callback is received
 *
 * @param callbackId - The unique callback ID
 * @param ref - The requisition reference from GoCardless
 */
export function resolveCallback(callbackId: string, ref: string): void {
  const pending = pendingCallbacks.get(callbackId)
  if (pending) {
    clearTimeout(pending.timeout)
    pending.resolve(ref)
    pendingCallbacks.delete(callbackId)
  }
}
