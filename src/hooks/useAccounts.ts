'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getAccounts,
  getAccountsWithPendingImports,
} from '@/app/_actions/accounts'
import { queryKeys } from './query-keys'

export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts.all,
    queryFn: getAccounts,
  })
}

export function useAccountsWithPendingImports() {
  return useQuery({
    queryKey: queryKeys.accounts.withPending(),
    queryFn: getAccountsWithPendingImports,
  })
}
