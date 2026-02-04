'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import {
  getImports,
  getImportResult,
  runImport,
  deleteImport,
  reExecuteRulesForImport,
  reExecuteRulesForTransaction,
  toggleSkippedRule,
  applyManualRuleToTransactions,
  removeManualRule,
  updateTransactionMeta,
} from '@/app/_actions/imports'
import { confirmImport } from '@/app/_actions/confirm'
import { queryKeys } from './query-keys'

export function useImports() {
  return useQuery({
    queryKey: queryKeys.imports.all,
    queryFn: getImports,
  })
}

export function useImportResult(importId: string) {
  return useQuery({
    queryKey: queryKeys.imports.detail(importId),
    queryFn: () => getImportResult(importId),
    enabled: !!importId,
  })
}

// Streaming import hook - combines mutation trigger with streaming output
type StreamingOutput = {
  accountId: string
  accountName: string
  output: string
  status: 'idle' | 'running' | 'completed' | 'error'
}

export function useRunImport() {
  const queryClient = useQueryClient()
  const [outputs, setOutputs] = useState<Map<string, StreamingOutput>>(
    new Map(),
  )

  const runSingleImport = useCallback(
    async (accountId: string, accountName: string): Promise<boolean> => {
      // Initialize output
      setOutputs((prev) => {
        const next = new Map(prev)
        next.set(accountId, {
          accountId,
          accountName,
          output: '',
          status: 'running',
        })
        return next
      })

      try {
        const stream = await runImport(accountId)
        const reader = stream.getReader()
        const decoder = new TextDecoder()
        let fullOutput = ''
        let hasImportId = false

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const text = decoder.decode(value, { stream: true })
          fullOutput += text

          if (fullOutput.includes('__IMPORT_ID__')) {
            hasImportId = true
          }

          // Filter and update output
          const filteredText = fullOutput.includes('__IMPORT_ID__')
            ? fullOutput.substring(0, fullOutput.indexOf('__IMPORT_ID__'))
            : fullOutput

          setOutputs((prev) => {
            const next = new Map(prev)
            const current = next.get(accountId)
            if (current) {
              next.set(accountId, { ...current, output: filteredText })
            }
            return next
          })
        }

        // Mark completion status
        setOutputs((prev) => {
          const next = new Map(prev)
          const current = next.get(accountId)
          if (current) {
            next.set(accountId, {
              ...current,
              status: hasImportId ? 'completed' : 'error',
            })
          }
          return next
        })

        return hasImportId
      } catch (error) {
        setOutputs((prev) => {
          const next = new Map(prev)
          const current = next.get(accountId)
          if (current) {
            next.set(accountId, {
              ...current,
              status: 'error',
              output:
                current.output +
                `\nError: ${error instanceof Error ? error.message : String(error)}\n`,
            })
          }
          return next
        })
        return false
      }
    },
    [],
  )

  const runImports = useMutation({
    mutationFn: async ({
      accounts,
    }: {
      accounts: { id: string; name: string }[]
    }) => {
      setOutputs(new Map())
      const results = await Promise.all(
        accounts.map((acc) => runSingleImport(acc.id, acc.name)),
      )
      return results.every(Boolean)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.all })
      queryClient.invalidateQueries({
        queryKey: queryKeys.accounts.withPending(),
      })
    },
  })

  const clearOutputs = useCallback(() => {
    setOutputs(new Map())
  }, [])

  return {
    outputs,
    clearOutputs,
    runImports,
  }
}

export function useDeleteImport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (importId: string) => deleteImport(importId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.all })
      queryClient.invalidateQueries({
        queryKey: queryKeys.accounts.withPending(),
      })
    },
  })
}

export function useConfirmImport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (importId: string) => confirmImport(importId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.all })
      queryClient.invalidateQueries({
        queryKey: queryKeys.accounts.withPending(),
      })
    },
  })
}

export function useReExecuteRulesForImport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (importId: string) => reExecuteRulesForImport(importId),
    onSuccess: (_, importId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.imports.detail(importId),
      })
    },
  })
}

export function useReExecuteRulesForTransaction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      importId,
      transactionId,
    }: {
      importId: string
      transactionId: string
    }) => reExecuteRulesForTransaction(importId, transactionId),
    onSuccess: (_, { importId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.imports.detail(importId),
      })
    },
  })
}

export function useToggleSkippedRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      importId,
      transactionId,
      ruleId,
    }: {
      importId: string
      transactionId: string
      ruleId: string
    }) => toggleSkippedRule(importId, transactionId, ruleId),
    onSuccess: (_, { importId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.imports.detail(importId),
      })
    },
  })
}

export function useApplyManualRuleToTransactions() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      importId,
      transactionIds,
      ruleId,
    }: {
      importId: string
      transactionIds: string[]
      ruleId: string
    }) => applyManualRuleToTransactions(importId, transactionIds, ruleId),
    onSuccess: (_, { importId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.imports.detail(importId),
      })
    },
  })
}

export function useRemoveManualRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      importId,
      transactionIds,
      ruleId,
    }: {
      importId: string
      transactionIds: string[]
      ruleId: string
    }) => removeManualRule(importId, transactionIds, ruleId),
    onSuccess: (_, { importId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.imports.detail(importId),
      })
    },
  })
}

export function useUpdateTransactionMeta() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      importId,
      transactionId,
      key,
      value,
    }: {
      importId: string
      transactionId: string
      key: string
      value: string | number | boolean | null
    }) => updateTransactionMeta(importId, transactionId, key, value),
    onSuccess: (_, { importId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.imports.detail(importId),
      })
    },
  })
}
