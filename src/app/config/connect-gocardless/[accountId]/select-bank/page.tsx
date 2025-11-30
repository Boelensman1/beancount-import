import Link from 'next/link'
import { getSerializedConfig } from '@/app/config/actions'
import { getBanksForCountry } from '../../actions'
import { redirect } from 'next/navigation'
import BankList from './bank-list'

export default async function SelectBankPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>
  searchParams: Promise<{ country?: string }>
}) {
  const { accountId } = await params
  const { country } = await searchParams

  // Redirect if country is missing
  if (!country) {
    redirect(`/config/connect-gocardless/${accountId}`)
  }

  const config = await getSerializedConfig()

  // Find the account
  const account = config.accounts.find((a) => a.id === accountId)

  if (!account) {
    redirect('/config')
  }

  // Fetch banks for the country
  const result = await getBanksForCountry(country)

  if (!result.success || !result.banks) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white shadow-md rounded-lg px-8 pt-6 pb-8">
            <div className="mb-6">
              <Link
                href={`/config/connect-gocardless/${accountId}`}
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
              >
                ← Back to Country Selection
              </Link>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Error Loading Banks
            </h1>

            <div className="bg-red-50 text-red-800 border border-red-200 p-4 rounded-md mb-4">
              {result.error ?? 'Failed to load banks for this country'}
            </div>

            <Link
              href={`/config/connect-gocardless/${accountId}`}
              className="inline-block px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
            >
              Try Again
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white shadow-md rounded-lg px-8 pt-6 pb-8">
          <div className="mb-6">
            <Link
              href={`/config/connect-gocardless/${accountId}`}
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
            >
              ← Back to Country Selection
            </Link>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Connect GoCardless
          </h1>
          <p className="text-sm text-gray-600 mb-6">
            Account: <span className="font-medium">{account.name}</span>
          </p>

          <div className="mb-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Step 2: Select Your Bank
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Choose your bank from the list below.
            </p>
          </div>

          <BankList
            accountId={accountId}
            banks={result.banks}
            countryCode={country}
          />
        </div>
      </div>
    </div>
  )
}
