'use client'

import { QueryClientProvider as TanStackQueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'
import { createQueryClient } from './query-client'

export function QueryClientProvider({
  children,
}: {
  children: React.ReactNode
}) {
  // Create QueryClient instance once per client-side lifecycle
  const [queryClient] = useState(() => createQueryClient())

  return (
    <TanStackQueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </TanStackQueryClientProvider>
  )
}
