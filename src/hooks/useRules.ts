'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getRulesForAccount,
  createRule,
  updateRule,
  deleteRule,
  toggleRuleEnabled,
  updateRulePriority,
  getUserVariablesForRuleForm,
} from '@/app/rules/actions'
import type { Rule } from '@/lib/db/types'
import { queryKeys } from './query-keys'

export function useRulesForAccount(accountId: string) {
  return useQuery({
    queryKey: queryKeys.rules.byAccount(accountId),
    queryFn: () => getRulesForAccount(accountId),
    enabled: !!accountId,
  })
}

export function useUserVariablesForRuleForm(accountId: string) {
  return useQuery({
    queryKey: queryKeys.rules.formVariables(accountId),
    queryFn: () => getUserVariablesForRuleForm(accountId),
    enabled: !!accountId,
  })
}

export function useCreateRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      accountId,
      rule,
    }: {
      accountId: string
      rule: Omit<Rule, 'id'>
    }) => createRule(accountId, rule),
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.rules.byAccount(accountId),
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
    },
  })
}

export function useUpdateRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      accountId,
      ruleId,
      updates,
    }: {
      accountId: string
      ruleId: string
      updates: Omit<Rule, 'id'>
    }) => updateRule(accountId, ruleId, updates),
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.rules.byAccount(accountId),
      })
    },
  })
}

export function useDeleteRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      accountId,
      ruleId,
    }: {
      accountId: string
      ruleId: string
    }) => deleteRule(accountId, ruleId),
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.rules.byAccount(accountId),
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
    },
  })
}

export function useToggleRuleEnabled() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      accountId,
      ruleId,
    }: {
      accountId: string
      ruleId: string
    }) => toggleRuleEnabled(accountId, ruleId),
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.rules.byAccount(accountId),
      })
    },
  })
}

export function useUpdateRulePriority() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      accountId,
      ruleId,
      newPriority,
    }: {
      accountId: string
      ruleId: string
      newPriority: number
    }) => updateRulePriority(accountId, ruleId, newPriority),
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.rules.byAccount(accountId),
      })
    },
  })
}
