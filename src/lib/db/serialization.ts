import type { Account, Config, Database } from './types'

/**
 * Serialize GoCardless config for JSON storage
 * Converts Temporal objects to ISO strings
 */
function serializeGoCardlessConfig(config: NonNullable<Account['goCardless']>) {
  return {
    countryCode: config.countryCode,
    bankId: config.bankId,
    reqRef: config.reqRef,
    accounts: config.accounts,
    importedTill: config.importedTill.toString(),
    endUserAgreementValidTill: config.endUserAgreementValidTill.toString(),
  }
}

/**
 * Serialize Account for JSON storage
 */
export function serializeAccount(account: Account) {
  return {
    ...account,
    goCardless: account.goCardless
      ? serializeGoCardlessConfig(account.goCardless)
      : undefined,
  }
}

/**
 * Serialize Config for JSON storage
 */
export function serializeConfig(config: Config) {
  return {
    ...config,
    accounts: config.accounts.map(serializeAccount),
  }
}

/**
 * Serialize entire Database for JSON storage
 */
export function serializeDatabase(db: Database) {
  return {
    ...db,
    config: serializeConfig(db.config),
  }
}
