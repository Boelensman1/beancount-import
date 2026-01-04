'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { customList } from 'country-codes-list'
import { TextInput } from '@/app/components/inputs'

// GoCardless supported countries
// Reference: https://nordigen.zendesk.com/hc/en-gb/articles/6761166365085-Supported-countries
const SUPPORTED_COUNTRIES = [
  'AT', // Austria
  'BE', // Belgium
  'BG', // Bulgaria
  'HR', // Croatia
  'CY', // Cyprus
  'CZ', // Czech Republic
  'DK', // Denmark
  'EE', // Estonia
  'FI', // Finland
  'FR', // France
  'DE', // Germany
  'GR', // Greece
  'HU', // Hungary
  'IS', // Iceland
  'IE', // Ireland
  'IT', // Italy
  'LV', // Latvia
  'LI', // Liechtenstein
  'LT', // Lithuania
  'LU', // Luxembourg
  'MT', // Malta
  'NL', // Netherlands
  'NO', // Norway
  'PL', // Poland
  'PT', // Portugal
  'RO', // Romania
  'SK', // Slovakia
  'SI', // Slovenia
  'ES', // Spain
  'SE', // Sweden
  'GB', // United Kingdom
]

interface CountrySelectorProps {
  accountId: string
}

export default function CountrySelector({ accountId }: CountrySelectorProps) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')

  // Get country list from library
  const allCountries = useMemo(() => {
    const countryMap = customList('countryCode', '{countryNameEn}')
    return Object.entries(countryMap)
      .map(([code, name]) => ({ code, name }))
      .filter((country) => SUPPORTED_COUNTRIES.includes(country.code))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [])

  // Filter countries by search term
  const filteredCountries = useMemo(() => {
    if (!searchTerm) return allCountries
    const lowerSearch = searchTerm.toLowerCase()
    return allCountries.filter((country) =>
      country.name.toLowerCase().includes(lowerSearch),
    )
  }, [allCountries, searchTerm])

  const handleCountrySelect = (countryCode: string) => {
    router.push(
      `/config/connect-gocardless/${accountId}/select-bank?country=${countryCode}`,
    )
  }

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div>
        <label htmlFor="country-search" className="sr-only">
          Search countries
        </label>
        <TextInput
          id="country-search"
          placeholder="Search countries..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Country List */}
      <div className="border border-gray-300 rounded-md overflow-hidden">
        <div className="max-h-96 overflow-y-auto">
          {filteredCountries.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              No countries found matching &quot;{searchTerm}&quot;
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {filteredCountries.map((country) => (
                <li key={country.code}>
                  <button
                    type="button"
                    onClick={() => handleCountrySelect(country.code)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors focus:outline-none focus:bg-gray-100"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">
                        {country.name}
                      </span>
                      <span className="text-xs text-gray-500">
                        {country.code}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Showing {filteredCountries.length} of {allCountries.length} supported
        countries
      </p>
    </div>
  )
}
