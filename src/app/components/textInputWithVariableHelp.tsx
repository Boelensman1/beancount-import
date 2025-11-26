'use client'

import { useState, useEffect, type InputHTMLAttributes } from 'react'
import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline'

export interface Variable {
  variable: string // Variable name WITHOUT $ prefix (e.g., "account")
  explanation: string // Human-readable explanation
}

export interface TextInputWithVariableHelpProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  // Custom onChange with string value (more convenient than ChangeEvent)
  onChange: (value: string) => void

  // Required custom props
  variables: Variable[]

  // Optional custom props
  label?: string
}

export function TextInputWithVariableHelp({
  label,
  variables,
  onChange,
  className,
  ...inputProps
}: TextInputWithVariableHelpProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Escape key handler and body scroll lock
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false)
      }
    }

    if (isModalOpen) {
      document.addEventListener('keydown', handleEscape)
      // Prevent body scroll
      document.body.style.overflow = 'hidden'
      return () => {
        document.removeEventListener('keydown', handleEscape)
        document.body.style.overflow = 'unset'
      }
    }
  }, [isModalOpen])

  return (
    <div className={className}>
      {/* Optional label */}
      {label && (
        <label
          htmlFor={inputProps.id}
          className="block text-sm font-medium text-gray-600 mb-1"
        >
          {label}
          {inputProps.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* Input with help button */}
      <div className="relative">
        <input
          type="text"
          {...inputProps}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
      {isModalOpen && (
        <VariableHelpModal
          variables={variables}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  )
}

// Internal modal component
interface VariableHelpModalProps {
  variables: Variable[]
  onClose: () => void
}

function VariableHelpModal({ variables, onClose }: VariableHelpModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={onClose} // Close on overlay click
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6"
        onClick={(e) => e.stopPropagation()} // Prevent close on content click
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Available Variables</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Table */}
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
      </div>
    </div>
  )
}
