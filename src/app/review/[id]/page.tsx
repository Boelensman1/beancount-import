import { notFound } from 'next/navigation'
import { getAccounts } from '@/app/_actions/accounts'
import { getBatchResult } from '@/app/_actions/batches'
import BatchReviewDisplay from './batch-review-display'

export const dynamic = 'force-dynamic'
export const dynamicParams = true

interface ReviewPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  const { id } = await params
  const batchResult = await getBatchResult(id)
  const accounts = await getAccounts()

  if (!batchResult) {
    notFound()
  }

  return (
    <BatchReviewDisplay
      batch={batchResult.batch}
      imports={batchResult.imports}
      accounts={accounts}
    />
  )
}
