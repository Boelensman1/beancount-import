import Link from 'next/link'
import { getConfig } from '@/app/config/actions'
import { redirect } from 'next/navigation'
import CountrySelector from './country-selector'

export default async function SelectCountryPage({
  params,
}: {
  params: Promise<{ accountId: string }>
}) {
  const { accountId } = await params
  const config = await getConfig()

  // Find the account
  const account = config.accounts.find((a) => a.id === accountId)

  if (!account) {
    redirect('/config')
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white shadow-md rounded-lg px-8 pt-6 pb-8">
          <div className="mb-6">
            <Link
              href="/config"
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
            >
              ← Back to Configuration
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
              Step 1: Select Your Country
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Choose the country where your bank is located.
            </p>
          </div>

          <CountrySelector accountId={accountId} />
        </div>
      </div>
    </div>
  )
}
