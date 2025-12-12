'use client'

import { useState } from 'react'
import type { UserVariable } from '@/lib/db/types'
import { VariableForm } from './variable-form'
import ConfirmModal from '@/app/components/confirm-modal'
import { deleteGlobalVariable, deleteAccountVariable } from './actions'

interface VariableListProps {
  scope: 'global' | 'account'
  accountId?: string
  accountName: string
  variables: UserVariable[]
  onUpdate: () => void
}

export function VariableList({
  scope,
  accountId,
  accountName,
  variables,
  onUpdate,
}: VariableListProps) {
  const [showForm, setShowForm] = useState(false)
  const [editingVariable, setEditingVariable] = useState<UserVariable | null>(
    null,
  )
  const [deleteConfirm, setDeleteConfirm] = useState<UserVariable | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleCreate = () => {
    setEditingVariable(null)
    setShowForm(true)
  }

  const handleEdit = (variable: UserVariable) => {
    setEditingVariable(variable)
    setShowForm(true)
  }

  const handleCloseForm = () => {
    setShowForm(false)
    setEditingVariable(null)
  }

  const handleFormSuccess = () => {
    handleCloseForm()
    onUpdate()
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return

    setDeleting(true)
    try {
      let result
      if (scope === 'global') {
        result = await deleteGlobalVariable(deleteConfirm.id)
      } else if (accountId) {
        result = await deleteAccountVariable(accountId, deleteConfirm.id)
      }

      if (result?.success) {
        onUpdate()
      } else {
        alert(result?.message ?? 'Failed to delete variable')
      }
    } finally {
      setDeleting(false)
      setDeleteConfirm(null)
    }
  }

  const title =
    scope === 'global'
      ? 'Global Variables'
      : `Variables for ${accountName || 'Account'}`

  return (
    <div className="rounded border border-gray-300 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 p-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button
          onClick={handleCreate}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Add Variable
        </button>
      </div>

      {/* Variable Table */}
      {variables.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-gray-500">
            No variables defined yet. Click &quot;Add Variable&quot; to create
            one.
          </p>
          <p className="mt-2 text-sm text-gray-400">
            Variables can be used in rules with the syntax{' '}
            <code className="rounded bg-gray-100 px-1">$variableName</code>
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Description
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {variables.map((variable) => (
                <tr key={variable.id}>
                  <td className="whitespace-nowrap px-6 py-4">
                    <code className="rounded bg-blue-50 px-2 py-1 text-sm text-blue-700">
                      ${variable.name}
                    </code>
                  </td>
                  <td className="px-6 py-4">
                    <span className="max-w-xs truncate text-sm text-gray-900">
                      {variable.value}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-500">
                      {variable.description ?? '-'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right">
                    <button
                      onClick={() => handleEdit(variable)}
                      className="mr-2 text-sm text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(variable)}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Variable Form Modal */}
      {showForm && (
        <VariableForm
          scope={scope}
          accountId={accountId}
          existingVariable={editingVariable}
          onClose={handleCloseForm}
          onSuccess={handleFormSuccess}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <ConfirmModal
          isOpen={true}
          title="Delete Variable"
          message={`Are you sure you want to delete the variable "${deleteConfirm.name}"? This action cannot be undone.`}
          confirmLabel={deleting ? 'Deleting...' : 'Delete'}
          confirmButtonClass="bg-red-600 hover:bg-red-700"
          onConfirm={handleDelete}
          onClose={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}
