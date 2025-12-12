'use client'

import { useState } from 'react'
import type { UserVariable } from '@/lib/db/types'
import Modal from '@/app/components/modal'
import {
  createGlobalVariable,
  updateGlobalVariable,
  createAccountVariable,
  updateAccountVariable,
} from './actions'

interface VariableFormProps {
  scope: 'global' | 'account'
  accountId?: string
  existingVariable: UserVariable | null
  onClose: () => void
  onSuccess: () => void
}

export function VariableForm({
  scope,
  accountId,
  existingVariable,
  onClose,
  onSuccess,
}: VariableFormProps) {
  const isEditing = existingVariable !== null

  const [name, setName] = useState(existingVariable?.name ?? '')
  const [value, setValue] = useState(existingVariable?.value ?? '')
  const [description, setDescription] = useState(
    existingVariable?.description ?? '',
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Validate variable name format
  const namePattern = /^[a-zA-Z]\w*$/
  const isValidName = namePattern.test(name)
  const nameError =
    name && !isValidName
      ? 'Variable name must start with a letter and contain only letters, numbers, underscores'
      : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isValidName) {
      setError('Invalid variable name')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const variableData = {
        name,
        value,
        description: description || undefined,
      }

      let result

      if (isEditing) {
        // Update existing variable
        if (scope === 'global') {
          result = await updateGlobalVariable(existingVariable.id, variableData)
        } else if (accountId) {
          result = await updateAccountVariable(
            accountId,
            existingVariable.id,
            variableData,
          )
        }
      } else {
        // Create new variable
        if (scope === 'global') {
          result = await createGlobalVariable(variableData)
        } else if (accountId) {
          result = await createAccountVariable(accountId, variableData)
        }
      }

      if (result?.success) {
        onSuccess()
      } else {
        setError(result?.message ?? 'Operation failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  const title = isEditing ? 'Edit Variable' : 'Add Variable'

  return (
    <Modal isOpen={true} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded border border-red-300 bg-red-50 p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Name <span className="text-red-500">*</span>
          </label>
          <div className="mt-1 flex items-center">
            <span className="mr-1 text-gray-500">$</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="variableName"
              className={`flex-1 rounded border px-3 py-2 ${
                nameError ? 'border-red-300' : 'border-gray-300'
              }`}
              required
              disabled={submitting}
            />
          </div>
          {nameError && (
            <p className="mt-1 text-sm text-red-600">{nameError}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Use this as{' '}
            <code className="rounded bg-gray-100 px-1">
              ${name || 'variableName'}
            </code>{' '}
            in rules
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Value <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter variable value"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            required
            disabled={submitting}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            disabled={submitting}
          />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"
            disabled={submitting || !isValidName || !name || !value}
          >
            {submitting ? 'Saving...' : isEditing ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
