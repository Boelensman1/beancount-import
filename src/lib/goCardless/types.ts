export interface AuthResponse {
  access: string
  access_expires: number
  refresh: string
  refresh_expires: number
}

export interface GoCardlessBank {
  id: string
  name: string
  country_code: string
}

export interface LinkCreationResponse {
  link: string
}

export interface RequisitionGetResponse {
  id: string
  created: string
  redirect: string
  status: string
  institution_id: string
  agreement: string
  reference: string
  accounts: string[]
  user_language: string
  link: string
  ssn: string
  account_selection: boolean
  redirect_immediate: boolean
}

export interface AgreementGetResponse {
  id: string
  created: string
  institution_id: string
  max_historical_days: number
  access_valid_for_days: number
  access_scope: string[]
  accepted: string
  reconfirmation: boolean
}

export interface BookedTransaction {
  transactionId: string
  creditorName?: string
  creditorAccount?: {
    iban: string
  }
  debtorName?: string
  debtorAccount?: {
    iban: string
  }
  transactionAmount: {
    currency: string
    amount: string
  }
  bookingDate: string
  valueDate: string
  remittanceInformationUnstructured?: string
  remittanceInformationUnstructuredArray?: string[]
  bankTransactionCode?: string
  proprietaryBankTransactionCode?: string
  currencyExchange?: {
    instructedAmount: {
      amount: string
      currency: string
    }
    sourceCurrency: string
    exchangeRate: string
    unitCurrency: string
    targetCurrency: string
  }
}

export interface TransactionsResponse {
  transactions: {
    booked: BookedTransaction[]
    pending: {
      transactionAmount: {
        currency: string
        amount: string
      }
      valueDate: string
      remittanceInformationUnstructured: string
    }[]
  }
}

export interface BalancesResponse {
  balances: {
    balanceAmount: {
      amount: string
      currency: string
    }
    balanceType: string
    referenceDate: string
  }[]
}

export class GoCardlessError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly originalError?: unknown,
  ) {
    super(message)
    this.name = 'GoCardlessError'
  }
}

export type RequisitionRefResult = {
  link: string
  refPromise: Promise<string>
}
