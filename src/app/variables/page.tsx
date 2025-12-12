import { Suspense } from 'react'
import { getSerializedConfig } from '@/app/config/actions'
import { VariablesPageClient } from './variables-page-client'

export default async function VariablesPage() {
  const config = await getSerializedConfig()

  if (config.accounts.length === 0) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-6 text-2xl font-bold">Variables</h1>
        <div className="rounded border border-yellow-300 bg-yellow-50 p-4">
          <p className="text-yellow-700">
            No accounts configured. Please add an account in the Config page
            first.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-6 text-2xl font-bold">Variables</h1>
      <Suspense
        fallback={
          <div className="rounded border border-gray-300 bg-white p-8 text-center">
            <p className="text-gray-600">Loading...</p>
          </div>
        }
      >
        <VariablesPageClient accounts={config.accounts} />
      </Suspense>
    </main>
  )
}
