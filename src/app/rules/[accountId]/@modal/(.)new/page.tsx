import {
  QueryClient,
  dehydrate,
  HydrationBoundary,
} from '@tanstack/react-query'
import { redirect } from 'next/navigation'
import { getSerializedConfig } from '@/app/config/actions'
import { getUserVariablesForRuleForm } from '../../../actions'
import { queryKeys } from '@/hooks/query-keys'
import { RuleModalWrapper } from '../../rule-modal-wrapper'

export default async function InterceptedNewRulePage({
  params,
}: {
  params: Promise<{ accountId: string }>
}) {
  const { accountId } = await params
  const config = await getSerializedConfig()

  // Validate account exists
  const account = config.accounts.find((a) => a.id === accountId)
  if (!account) {
    redirect('/rules')
  }

  // Prefetch only modal data (rules data already cached in background)
  const queryClient = new QueryClient()
  await queryClient.prefetchQuery({
    queryKey: queryKeys.rules.formVariables(accountId),
    queryFn: () => getUserVariablesForRuleForm(accountId),
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <RuleModalWrapper accountId={accountId} />
    </HydrationBoundary>
  )
}
