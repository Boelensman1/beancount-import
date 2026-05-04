'use client'

import { useState } from 'react'
import { downloadGoCardlessCsv } from './connect-gocardless/actions'

interface DownloadCsvButtonProps {
  accountId: string
  disabled?: boolean
}

export default function DownloadCsvButton({
  accountId,
  disabled,
}: DownloadCsvButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDownload = async () => {
    setIsDownloading(true)
    setError(null)

    try {
      const result = await downloadGoCardlessCsv(accountId)

      if (!result.success || !result.csv || !result.filename) {
        setError(result.error ?? 'Failed to download CSV')
        return
      }

      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = result.filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={isDownloading || disabled}
        className="px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-600 rounded-md hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isDownloading ? 'Downloading...' : 'Download test CSV'}
      </button>
      {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
    </div>
  )
}
