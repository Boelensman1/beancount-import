import Link from 'next/link'
import { getConfig } from '@/app/config/actions'
import { redirect } from 'next/navigation'
import { resolveCallback } from '@/lib/goCardless/goCardless'
import CompleteButton from './complete-button'

export default async function CallbackPage({
  searchParams,
}: {
  searchParams: Promise<{
    ref?: string
    callbackId?: string
    accountId?: string
    country?: string
    bankId?: string
  }>
}) {
  const { ref, callbackId, accountId, country, bankId } = await searchParams

  // Validate required parameters
  if (!ref || !callbackId || !accountId || !country || !bankId) {
    redirect('/config')
  }

  // Resolve the callback promise
  resolveCallback(callbackId, ref)

  // Fetch account data
  const config = await getConfig()
  const account = config.accounts.find((a) => a.id === accountId)

  if (!account) {
    redirect('/config')
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white shadow-md rounded-lg px-8 pt-6 pb-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Authorization Successful!
            </h1>
            <p className="text-sm text-gray-600 mb-1">
              Account: <span className="font-medium">{account.name}</span>
            </p>
            <p className="text-sm text-gray-500">
              Your bank has authorized the connection to GoCardless.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
            <p className="text-sm text-blue-800">
              Click &quot;Complete Connection&quot; below to save the connection
              to your account.
            </p>
          </div>

          <CompleteButton
            accountId={accountId}
            reqRef={ref}
            countryCode={country}
            bankId={bankId}
          />

          <div className="mt-4 text-center">
            <Link
              href="/config"
              className="text-sm text-gray-600 hover:text-gray-800 hover:underline"
            >
              Cancel and return to configuration
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
