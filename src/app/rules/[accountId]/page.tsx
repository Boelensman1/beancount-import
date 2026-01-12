import {
  QueryClient,
  dehydrate,
  HydrationBoundary,
} from '@tanstack/react-query'
import { redirect } from 'next/navigation'
import { getSerializedConfig } from '@/app/config/actions'
import { getRulesForAccount } from '../actions'
import { queryKeys } from '@/hooks/query-keys'
import { RulesPageClient } from '../rules-page-client'

interface AccountRulesPageProps {
  params: Promise<{ accountId: string }>
}

export default async function AccountRulesPage({
  params,
}: AccountRulesPageProps) {
  const { accountId } = await params
  const config = await getSerializedConfig()

  // Validate account exists
  const account = config.accounts.find((a) => a.id === accountId)
  if (!account) {
    // Redirect to base /rules page (which will redirect to first account)
    redirect('/rules')
  }

  // Prefetch rules data on server
  const queryClient = new QueryClient()
  await queryClient.prefetchQuery({
    queryKey: queryKeys.rules.byAccount(accountId),
    queryFn: () => getRulesForAccount(accountId),
  })

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">Rules Management</h1>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <RulesPageClient accountId={accountId} accounts={config.accounts} />
      </HydrationBoundary>
    </div>
  )
}
