import { vi } from 'vitest'
import { Temporal } from '@js-temporal/polyfill'
import type {
  AuthResponse,
  GoCardlessBank,
  BookedTransaction,
  BalancesResponse,
} from '@/lib/goCardless/types'

/**
 * Creates a mock auth response
 */
export function createMockAuthResponse(): AuthResponse {
  return {
    access: 'test-access-token',
    access_expires: 3600,
    refresh: 'test-refresh-token',
    refresh_expires: 86400,
  }
}

/**
 * Creates mock banks for a given country
 */
export function createMockBanks(country = 'GB'): GoCardlessBank[] {
  return [
    {
      id: 'test-bank-1',
      name: 'Test Bank',
      country_code: country,
    },
    {
      id: 'test-bank-2',
      name: 'Another Test Bank',
      country_code: country,
    },
  ]
}

/**
 * Creates mock transactions
 */
export function createMockTransactions(): BookedTransaction[] {
  return [
    {
      transactionId: 'test-txn-1',
      creditorName: 'Test Creditor',
      creditorAccount: {
        iban: 'GB00TEST1234567890',
      },
      transactionAmount: {
        currency: 'GBP',
        amount: '-50.00',
      },
      bookingDate: '2025-01-15',
      valueDate: '2025-01-15',
      remittanceInformationUnstructured: 'Test transaction',
    },
    {
      transactionId: 'test-txn-2',
      debtorName: 'Test Debtor',
      debtorAccount: {
        iban: 'GB00TEST0987654321',
      },
      transactionAmount: {
        currency: 'GBP',
        amount: '100.00',
      },
      bookingDate: '2025-01-16',
      valueDate: '2025-01-16',
      remittanceInformationUnstructured: 'Another test transaction',
    },
  ]
}

/**
 * Creates mock balances
 */
export function createMockBalances(): BalancesResponse['balances'] {
  return [
    {
      balanceAmount: {
        amount: '1000.00',
        currency: 'GBP',
      },
      balanceType: 'interimAvailable',
      referenceDate: '2025-01-20',
    },
  ]
}

/**
 * Creates a mock GoCardless instance with all methods mocked
 */
export function createMockGoCardless(
  overrides: {
    auth?: ReturnType<typeof vi.fn>
    getListOfBanks?: ReturnType<typeof vi.fn>
    getRequisitionRef?: ReturnType<typeof vi.fn>
    listAccounts?: ReturnType<typeof vi.fn>
    getAgreementExpiration?: ReturnType<typeof vi.fn>
    listTransations?: ReturnType<typeof vi.fn>
    getTransationsForAccounts?: ReturnType<typeof vi.fn>
    getBalances?: ReturnType<typeof vi.fn>
  } = {},
) {
  return {
    secretId: 'test-secret-id',
    secretKey: 'test-secret-key',
    accessToken: 'test-token',
    accessTokenExpiration: new Date(Date.now() + 3600000),
    refreshToken: 'test-refresh',
    refreshTokenExpiration: new Date(Date.now() + 86400000),
    auth: overrides.auth ?? vi.fn().mockResolvedValue(undefined),
    getListOfBanks:
      overrides.getListOfBanks ?? vi.fn().mockResolvedValue(createMockBanks()),
    getRequisitionRef:
      overrides.getRequisitionRef ??
      vi.fn().mockResolvedValue({
        link: 'https://test-gocardless-link.com/auth',
        refPromise: Promise.resolve('test-ref-id'),
      }),
    listAccounts:
      overrides.listAccounts ??
      vi.fn().mockResolvedValue(['test-account-1', 'test-account-2']),
    getAgreementExpiration:
      overrides.getAgreementExpiration ??
      vi
        .fn()
        .mockResolvedValue(
          Temporal.Now.zonedDateTimeISO().add({ days: 90 }).toInstant(),
        ),
    listTransations:
      overrides.listTransations ??
      vi.fn().mockResolvedValue(createMockTransactions()),
    getTransationsForAccounts:
      overrides.getTransationsForAccounts ??
      vi.fn().mockResolvedValue(createMockTransactions()),
    getBalances:
      overrides.getBalances ?? vi.fn().mockResolvedValue(createMockBalances()),
  } as any // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Helper to setup GoCardless mock in tests
 * Call this in beforeEach to ensure fresh mock state
 *
 * @example
 * ```ts
 * import { setupGoCardlessMock } from '@/test/mocks/goCardless';
 *
 * beforeEach(() => {
 *   setupGoCardlessMock();
 * });
 *
 * it('should work', async () => {
 *   const mockGc = createMockGoCardless();
 *   vi.mocked(getGoCardless).mockResolvedValue(mockGc);
 *   // ... rest of test
 * });
 * ```
 */
export function setupGoCardlessMock() {
  // Clear all mocks between tests
  vi.clearAllMocks()
}
