import {
  QueryClient,
  dehydrate,
  HydrationBoundary,
} from '@tanstack/react-query'
import { redirect } from 'next/navigation'
import { getSerializedConfig } from '@/app/config/actions'
import { getRulesForAccount, getUserVariablesForRuleForm } from '../../actions'
import { queryKeys } from '@/hooks/query-keys'
import { RuleModalWrapper } from '../rule-modal-wrapper'
import { RulesPageClient } from '../../rules-page-client'

interface NewRulePageProps {
  params: Promise<{ accountId: string }>
}

export default async function NewRulePage({ params }: NewRulePageProps) {
  const { accountId } = await params
  const config = await getSerializedConfig()

  // Validate account exists
  const account = config.accounts.find((a) => a.id === accountId)
  if (!account) {
    redirect('/rules')
  }

  // Prefetch both queries in parallel
  const queryClient = new QueryClient()
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.rules.byAccount(accountId),
      queryFn: () => getRulesForAccount(accountId),
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.rules.formVariables(accountId),
      queryFn: () => getUserVariablesForRuleForm(accountId),
    }),
  ])

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {/* Background: Rules List */}
      <div className="container mx-auto px-4 py-8">
        <h1 className="mb-6 text-3xl font-bold">Rules Management</h1>
        <RulesPageClient accountId={accountId} accounts={config.accounts} />
      </div>

      {/* Foreground: Modal Overlay */}
      <RuleModalWrapper accountId={accountId} />
    </HydrationBoundary>
  )
}
