export const queryKeys = {
  // Accounts
  accounts: {
    all: ['accounts'] as const,
    withPending: () => [...queryKeys.accounts.all, 'withPending'] as const,
  },

  // Batches
  batches: {
    all: ['batches'] as const,
    detail: (batchId: string) => [...queryKeys.batches.all, batchId] as const,
  },

  // Imports
  imports: {
    all: ['imports'] as const,
    detail: (importId: string) => [...queryKeys.imports.all, importId] as const,
  },

  // Rules
  rules: {
    all: ['rules'] as const,
    byAccount: (accountId: string) =>
      [...queryKeys.rules.all, accountId] as const,
    formVariables: (accountId: string) =>
      [...queryKeys.rules.all, 'formVariables', accountId] as const,
  },

  // Variables
  variables: {
    all: ['variables'] as const,
    global: () => [...queryKeys.variables.all, 'global'] as const,
    byAccount: (accountId: string) =>
      [...queryKeys.variables.all, 'account', accountId] as const,
  },

  // Config
  config: {
    all: ['config'] as const,
  },
}
