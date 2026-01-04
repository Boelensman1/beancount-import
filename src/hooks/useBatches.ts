'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getBatches,
  getBatchResult,
  createBatch,
  deleteBatch,
  confirmImport,
} from '@/app/_actions/batches'
import { queryKeys } from './query-keys'

export function useBatches() {
  return useQuery({
    queryKey: queryKeys.batches.all,
    queryFn: getBatches,
  })
}

export function useBatchResult(batchId: string) {
  return useQuery({
    queryKey: queryKeys.batches.detail(batchId),
    queryFn: () => getBatchResult(batchId),
    enabled: !!batchId,
  })
}

export function useCreateBatch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (accountIds: string[]) => createBatch(accountIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.batches.all })
    },
  })
}

export function useDeleteBatch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (batchId: string) => deleteBatch(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.batches.all })
      queryClient.invalidateQueries({
        queryKey: queryKeys.accounts.withPending(),
      })
    },
  })
}

export function useConfirmImport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (batchId: string) => confirmImport(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.batches.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.imports.all })
      queryClient.invalidateQueries({
        queryKey: queryKeys.accounts.withPending(),
      })
    },
  })
}
