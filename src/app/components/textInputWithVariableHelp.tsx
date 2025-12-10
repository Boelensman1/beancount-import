'use client'

import { useState, type InputHTMLAttributes } from 'react'
import clsx from 'clsx'
import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline'
import Modal from './modal'

export interface Variable {
  variable: string // Variable name WITHOUT $ prefix (e.g., "account")
  explanation: string // Human-readable explanation
}

export interface TextInputWithVariableHelpProps
  extends InputHTMLAttributes<HTMLInputElement> {
  // Required custom props
  variables: Variable[]
}

// Variable list constants - exported for use in action-builder.tsx
export const FULL_TEXT_VARIABLES: Variable[] = [
  {
    variable: 'narration',
    explanation: 'Current transaction narration',
  },
  {
    variable: 'payee',
    explanation: 'Current transaction payee',
  },
  {
    variable: 'date',
    explanation: 'Transaction date (ISO format)',
  },
  {
    variable: 'postingAmount[N]',
    explanation:
      'Amount of Nth posting (e.g., $postingAmount[0] for first posting)',
  },
  {
    variable: 'postingAccount[N]',
    explanation: 'Account of Nth posting (e.g., $postingAccount[0])',
  },
  {
    variable: 'postingCurrency[N]',
    explanation: 'Currency of Nth posting (e.g., $postingCurrency[0])',
  },
  {
    variable: 'absolutePostingAmount[N]',
    explanation:
      'Absolute value of Nth posting amount (e.g., $absolutePostingAmount[0])',
  },
  {
    variable: 'metadata_keyName',
    explanation: 'Transaction metadata value (e.g., $metadata_receipt_id)',
  },
]

export const AMOUNT_VALUE_VARIABLES: Variable[] = [
  {
    variable: 'postingAmount[N]',
    explanation:
      'Amount of Nth posting (e.g., $postingAmount[0] for first posting)',
  },
  {
    variable: 'absolutePostingAmount[N]',
    explanation:
      'Absolute value of Nth posting amount (e.g., $absolutePostingAmount[0])',
  },
  {
    variable: 'metadata_keyName',
    explanation: 'Transaction metadata value (e.g., $metadata_receipt_id)',
  },
]

export const CURRENCY_VARIABLES: Variable[] = [
  {
    variable: 'postingCurrency[N]',
    explanation: 'Currency of Nth posting (e.g., $postingCurrency[0])',
  },
]

export function TextInputWithVariableHelp({
  variables,
  className,
  ...inputProps
}: TextInputWithVariableHelpProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <div>
      {/* Input with help button */}
      <div className="relative">
        <input
          type="text"
          {...inputProps}
          className={clsx(
            'w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed',
            className,
          )}
        />

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          disabled={inputProps.disabled}
          aria-label="Show available variables"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <QuestionMarkCircleIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Available Variables"
      >
        {variables.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No variables available</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="px-4 py-2 text-left font-medium">Variable</th>
                <th className="px-4 py-2 text-left font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {variables.map((v, index) => (
                <tr
                  key={v.variable}
                  className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                >
                  <td className="px-4 py-3 font-mono text-sm">${v.variable}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {v.explanation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  )
}
