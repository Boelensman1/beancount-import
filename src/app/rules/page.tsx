import { Suspense } from 'react'
import { getConfig } from '@/app/config/actions'
import { RulesPageClient } from './rules-page-client'

export default async function RulesPage() {
  const config = await getConfig()

  if (config.accounts.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="mb-6 text-3xl font-bold">Rules Management</h1>
        <div className="rounded border border-yellow-300 bg-yellow-50 p-6">
          <p className="text-yellow-800">
            No accounts configured yet. Please configure at least one account
            before creating rules.
          </p>
          <a
            href="/config"
            className="mt-4 inline-block rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
          >
            Go to Configuration
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold">Rules Management</h1>
      <Suspense
        fallback={<div className="text-gray-600">Loading rules...</div>}
      >
        <RulesPageClient accounts={config.accounts} />
      </Suspense>
    </div>
  )
}
