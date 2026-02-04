import ImportReviewDisplay from './import-review-display'

interface ReviewPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  const { id } = await params

  return <ImportReviewDisplay importId={id} />
}
