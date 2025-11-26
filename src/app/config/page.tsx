import Link from 'next/link'
import { getConfig, updateConfig } from './actions'
import ConfigForm from './config-form'

export default async function ConfigPage() {
  const config = await getConfig()

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white shadow-md rounded-lg px-8 pt-6 pb-8 mb-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            Configuration
          </h1>

          <ConfigForm
            initialAccounts={config.accounts}
            initialDefaults={config.defaults}
            updateConfig={updateConfig}
          />
        </div>

        <div className="text-center">
          <Link
            href="/"
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            Back to Import
          </Link>
        </div>
      </div>
    </div>
  )
}
