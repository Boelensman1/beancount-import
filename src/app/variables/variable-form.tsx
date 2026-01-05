'use client'

import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { UserVariable } from '@/lib/db/types'
import Modal from '@/app/components/modal'
import { TextInput } from '@/app/components/inputs'
import {
  createGlobalVariable,
  updateGlobalVariable,
  createAccountVariable,
  updateAccountVariable,
} from './actions'
import {
  VariableFormSchema,
  type VariableFormData,
} from './variable-form.schema'

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
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VariableFormData>({
    resolver: zodResolver(VariableFormSchema),
    defaultValues: {
      name: existingVariable?.name ?? '',
      value: existingVariable?.value ?? '',
      description: existingVariable?.description ?? '',
    },
  })

  const name = useWatch({ control, name: 'name' })

  const onSubmit = async (data: VariableFormData) => {
    setServerError(null)

    try {
      const variableData = {
        name: data.name,
        value: data.value,
        description: data.description ?? undefined,
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
        setServerError(result?.message ?? 'Operation failed')
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const title = isEditing ? 'Edit Variable' : 'Add Variable'

  return (
    <Modal isOpen={true} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <div className="rounded border border-red-300 bg-red-50 p-3">
            <p className="text-sm text-red-700">{serverError}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Name <span className="text-red-500">*</span>
          </label>
          <div className="mt-1 flex items-center">
            <span className="mr-1 text-gray-500">$</span>
            <TextInput
              {...register('name')}
              placeholder="variableName"
              className="flex-1"
              disabled={isSubmitting}
              error={errors.name?.message}
            />
          </div>
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
          <div className="mt-1">
            <TextInput
              {...register('value')}
              placeholder="Enter variable value"
              disabled={isSubmitting}
              error={errors.value?.message}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Description
          </label>
          <div className="mt-1">
            <TextInput
              {...register('description')}
              placeholder="Optional description"
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-300"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
