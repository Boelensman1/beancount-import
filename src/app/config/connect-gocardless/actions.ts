'use server'

import crypto from 'crypto'
import { Temporal } from '@js-temporal/polyfill'
import { getDb } from '@/lib/db/db'
import { getGoCardless } from '@/lib/goCardless/goCardless'
import type { GoCardlessBank } from '@/lib/goCardless/types'

/**
 * Disconnect a GoCardless connection from an account
 */
export async function disconnectGoCardless(accountId: string): Promise<{
  success: boolean
  message: string
}> {
  try {
    const db = await getDb()
    const account = db.data.config.accounts.find((a) => a.id === accountId)

    if (!account) {
      return { success: false, message: 'Account not found' }
    }

    // Remove GoCardless configuration
    delete account.goCardless

    // save
    await db.write()

    return { success: true, message: 'Disconnected successfully' }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get list of banks for a country
 */
export async function getBanksForCountry(countryCode: string): Promise<{
  success: boolean
  banks?: GoCardlessBank[]
  error?: string
}> {
  try {
    const goCardless = await getGoCardless()
    const banks = await goCardless.getListOfBanks(countryCode)
    return { success: true, banks }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Initiate a GoCardless connection
 * Returns an OAuth link for the user to visit
 */
export async function initiateConnection(
  accountId: string,
  institutionId: string,
  countryCode: string,
  bankId: string,
): Promise<{ success: boolean; link?: string; error?: string }> {
  try {
    const goCardless = await getGoCardless()

    // Create callback URL with all necessary parameters
    const callbackId = crypto.randomUUID()
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:5002'
    const callbackUrl = `${baseUrl}/config/connect-gocardless/${accountId}/callback?callbackId=${callbackId}&country=${countryCode}&bankId=${bankId}`

    const { link } = await goCardless.getRequisitionRef(
      institutionId,
      callbackUrl,
    )

    return { success: true, link: link }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Complete a GoCardless connection after OAuth callback
 */
export async function completeGoCardlessConnection(
  accountId: string,
  reqRef: string,
  countryCode: string,
  bankId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const db = await getDb()
    const account = db.data.config.accounts.find((a) => a.id === accountId)

    if (!account) {
      return { success: false, message: 'Account not found' }
    }

    // Get account IDs from GoCardless
    const goCardless = await getGoCardless()
    const accounts = await goCardless.listAccounts(reqRef)
    const endUserAgreementValidTill =
      await goCardless.getAgreementExpiration(reqRef)

    // Update account with GoCardless config
    account.goCardless = {
      countryCode,
      bankId,
      reqRef,
      accounts,
      importedTill: Temporal.PlainDate.from('1970-01-01'),
      endUserAgreementValidTill,
    }

    await db.write()

    return { success: true, message: 'Connection completed successfully!' }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
