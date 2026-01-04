'use client'

import { useState, useRef } from 'react'
import clsx from 'clsx'
import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline'
import Modal from './modal'
import { TextInput, type TextInputProps } from './inputs'

export interface Variable {
  variable: string // Variable name WITHOUT $ prefix (e.g., "account")
  explanation: string // Human-readable explanation
}

export interface TextInputWithVariableHelpProps extends TextInputProps {
  // Required custom props
  variables: Variable[]
  // Optional user-defined variables (displayed in separate section)
  userVariables?: Variable[]
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
    variable: 'negatedPostingAmount[N]',
    explanation:
      'Negated amount of Nth posting (e.g., $negatedPostingAmount[0])',
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
    variable: 'negatedPostingAmount[N]',
    explanation:
      'Negated amount of Nth posting (e.g., $negatedPostingAmount[0])',
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

function VariableTable({
  variables,
  onVariableClick,
}: {
  variables: Variable[]
  onVariableClick?: (variable: string) => void
}) {
  return (
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
            className={clsx(
              index % 2 === 0 ? 'bg-white' : 'bg-gray-50',
              onVariableClick &&
                'cursor-pointer hover:bg-blue-50 transition-colors',
            )}
            onClick={() => onVariableClick?.(v.variable)}
          >
            <td className="px-4 py-3 font-mono text-sm">${v.variable}</td>
            <td className="px-4 py-3 text-sm text-gray-700">{v.explanation}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function TextInputWithVariableHelp({
  variables,
  userVariables = [],
  className,
  ...inputProps
}: TextInputWithVariableHelpProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const cursorPositionRef = useRef<number | null>(null)
  const hasBuiltInVariables = variables.length > 0
  const hasUserVariables = userVariables.length > 0
  const hasAnyVariables = hasBuiltInVariables || hasUserVariables

  const handleOpenModal = () => {
    // Store cursor position before modal steals focus
    cursorPositionRef.current = inputRef.current?.selectionStart ?? null
    setIsModalOpen(true)
  }

  const handleVariableClick = (variable: string) => {
    const variableText = `$${variable}`
    const currentValue = String(inputProps.value ?? '')
    const cursorPos = cursorPositionRef.current ?? currentValue.length

    // Insert variable at cursor position
    const newValue =
      currentValue.slice(0, cursorPos) +
      variableText +
      currentValue.slice(cursorPos)

    // Trigger onChange with synthetic event
    if (inputProps.onChange && inputRef.current) {
      const nativeEvent = new Event('input', { bubbles: true })
      Object.defineProperty(nativeEvent, 'target', {
        value: { ...inputRef.current, value: newValue },
      })
      inputProps.onChange(
        nativeEvent as unknown as React.ChangeEvent<HTMLInputElement>,
      )
    }

    setIsModalOpen(false)
  }

  return (
    <div>
      {/* Input with help button */}
      <div className="relative">
        <TextInput
          ref={inputRef}
          {...inputProps}
          className={className ? `pr-10 ${className}` : 'pr-10'}
        />

        <button
          type="button"
          onClick={handleOpenModal}
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
        {!hasAnyVariables ? (
          <p className="text-sm text-gray-500 italic">No variables available</p>
        ) : (
          <div className="space-y-6">
            {hasBuiltInVariables && (
              <div>
                {hasUserVariables && (
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    Transaction Variables
                  </h3>
                )}
                <VariableTable
                  variables={variables}
                  onVariableClick={handleVariableClick}
                />
              </div>
            )}
            {hasUserVariables && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  User Variables
                </h3>
                <VariableTable
                  variables={userVariables}
                  onVariableClick={handleVariableClick}
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
