'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSerializedConfig, updateConfig } from '@/app/config/actions'
import { queryKeys } from './query-keys'

export function useConfig() {
  return useQuery({
    queryKey: queryKeys.config.all,
    queryFn: getSerializedConfig,
  })
}

export function useUpdateConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (formData: FormData) => updateConfig(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.rules.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.variables.all })
    },
  })
}
