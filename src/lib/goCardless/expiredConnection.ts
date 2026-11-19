const EXPIRED_CONNECTION_SUFFIX =
  'has expired. Please reconnect in account settings.'

export function expiredConnectionMessage(accountName: string): string {
  return `GoCardless connection for "${accountName}" ${EXPIRED_CONNECTION_SUFFIX}`
}

export function isExpiredConnectionMessage(message: string): boolean {
  return message.includes(EXPIRED_CONNECTION_SUFFIX)
}

export function accountSettingsHref(accountId: string): string {
  return `/config#account-${accountId}`
}
