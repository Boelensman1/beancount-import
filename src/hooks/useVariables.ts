'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getGlobalVariables,
  getAccountVariables,
  createGlobalVariable,
  updateGlobalVariable,
  deleteGlobalVariable,
  createAccountVariable,
  updateAccountVariable,
  deleteAccountVariable,
} from '@/app/variables/actions'
import type { UserVariable } from '@/lib/db/types'
import { queryKeys } from './query-keys'

// Global Variables
export function useGlobalVariables() {
  return useQuery({
    queryKey: queryKeys.variables.global(),
    queryFn: getGlobalVariables,
  })
}

export function useCreateGlobalVariable() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (variable: Omit<UserVariable, 'id'>) =>
      createGlobalVariable(variable),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.variables.global() })
      queryClient.invalidateQueries({ queryKey: queryKeys.rules.all })
    },
  })
}

export function useUpdateGlobalVariable() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      variableId,
      updates,
    }: {
      variableId: string
      updates: Omit<UserVariable, 'id'>
    }) => updateGlobalVariable(variableId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.variables.global() })
      queryClient.invalidateQueries({ queryKey: queryKeys.rules.all })
    },
  })
}

export function useDeleteGlobalVariable() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (variableId: string) => deleteGlobalVariable(variableId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.variables.global() })
      queryClient.invalidateQueries({ queryKey: queryKeys.rules.all })
    },
  })
}

// Account Variables
export function useAccountVariables(accountId: string) {
  return useQuery({
    queryKey: queryKeys.variables.byAccount(accountId),
    queryFn: () => getAccountVariables(accountId),
    enabled: !!accountId,
  })
}

export function useCreateAccountVariable() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      accountId,
      variable,
    }: {
      accountId: string
      variable: Omit<UserVariable, 'id'>
    }) => createAccountVariable(accountId, variable),
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.variables.byAccount(accountId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.rules.formVariables(accountId),
      })
    },
  })
}

export function useUpdateAccountVariable() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      accountId,
      variableId,
      updates,
    }: {
      accountId: string
      variableId: string
      updates: Omit<UserVariable, 'id'>
    }) => updateAccountVariable(accountId, variableId, updates),
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.variables.byAccount(accountId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.rules.formVariables(accountId),
      })
    },
  })
}

export function useDeleteAccountVariable() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      accountId,
      variableId,
    }: {
      accountId: string
      variableId: string
    }) => deleteAccountVariable(accountId, variableId),
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.variables.byAccount(accountId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.rules.formVariables(accountId),
      })
    },
  })
}
