import {
  QueryClient,
  dehydrate,
  HydrationBoundary,
} from '@tanstack/react-query'
import { redirect } from 'next/navigation'
import { getSerializedConfig } from '@/app/config/actions'
import {
  getRulesForAccount,
  getUserVariablesForRuleForm,
} from '../../../actions'
import { queryKeys } from '@/hooks/query-keys'
import { RuleModalWrapper } from '../../rule-modal-wrapper'

export default async function InterceptedEditRulePage({
  params,
}: {
  params: Promise<{ accountId: string; ruleId: string }>
}) {
  const { accountId, ruleId } = await params
  const config = await getSerializedConfig()

  // Validate account exists
  const account = config.accounts.find((a) => a.id === accountId)
  if (!account) {
    redirect('/rules')
  }

  // Fetch rules data to find the specific rule
  const queryClient = new QueryClient()
  const rulesData = await queryClient.fetchQuery({
    queryKey: queryKeys.rules.byAccount(accountId),
    queryFn: () => getRulesForAccount(accountId),
  })

  // Validate rule exists
  const rule = rulesData?.rules.find((r) => r.id === ruleId)
  if (!rule) {
    redirect(`/rules/${accountId}`)
  }

  // Prefetch form variables
  await queryClient.prefetchQuery({
    queryKey: queryKeys.rules.formVariables(accountId),
    queryFn: () => getUserVariablesForRuleForm(accountId),
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <RuleModalWrapper accountId={accountId} rule={rule} />
    </HydrationBoundary>
  )
}
