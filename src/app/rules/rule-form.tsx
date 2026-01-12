'use client'

import { useState } from 'react'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { Rule } from '@/lib/db/types'
import {
  TextInput,
  NumberInput,
  Textarea,
  Checkbox,
} from '@/app/components/inputs'
import { SelectorBuilder } from './selector-builder'
import { ActionBuilder } from './action-builder'
import {
  useCreateRule,
  useUpdateRule,
  useUserVariablesForRuleForm,
} from '@/hooks/useRules'
import Modal from '@/app/components/modal'
import { RuleFormSchema, type RuleFormData } from './rule-form.schema'

interface RuleFormProps {
  accountId: string
  rule?: Rule
  onClose: () => void
  onSuccess: () => void
}

export function RuleForm({
  accountId,
  rule,
  onClose,
  onSuccess,
}: RuleFormProps) {
  const isEditing = !!rule
  const [serverError, setServerError] = useState<string | null>(null)

  // Use React Query mutations
  const createMutation = useCreateRule()
  const updateMutation = useUpdateRule()

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RuleFormData>({
    // Type assertion needed because z.lazy() in SelectorExpressionSchema doesn't infer types correctly
    resolver: zodResolver(RuleFormSchema) as never,
    defaultValues: {
      name: rule?.name ?? '',
      description: rule?.description ?? '',
      enabled: rule?.enabled ?? true,
      priority: rule?.priority ?? 100,
      selector: rule?.selector ?? {
        type: 'narration',
        pattern: '',
        matchType: 'substring',
      },
      allowManualSelection: rule?.allowManualSelection ?? false,
      actions: rule?.actions ?? [],
      showExpectations: !!rule?.expectations,
      minAmount: rule?.expectations?.minAmount?.toString() ?? '',
      maxAmount: rule?.expectations?.maxAmount?.toString() ?? '',
      currency: rule?.expectations?.currency ?? '',
    },
  })

  const showExpectations = useWatch({ control, name: 'showExpectations' })
  const actions = useWatch({ control, name: 'actions' })

  // Fetch user variables
  const { data: userVariables = [] } = useUserVariablesForRuleForm(accountId)

  const onSubmit = async (data: RuleFormData) => {
    setServerError(null)

    const ruleData = {
      name: data.name,
      description: data.description ?? undefined,
      enabled: data.enabled,
      priority: data.priority,
      selector: data.selector,
      allowManualSelection: data.allowManualSelection,
      actions: data.actions,
      expectations: data.showExpectations
        ? {
            minAmount: data.minAmount ? parseFloat(data.minAmount) : undefined,
            maxAmount: data.maxAmount ? parseFloat(data.maxAmount) : undefined,
            currency: data.currency ?? undefined,
          }
        : undefined,
    }

    try {
      if (isEditing && rule) {
        // Use update mutation
        await updateMutation.mutateAsync({
          accountId,
          ruleId: rule.id,
          updates: ruleData,
        })
      } else {
        // Use create mutation
        await createMutation.mutateAsync({
          accountId,
          rule: ruleData,
        })
      }

      // Mutations handle cache invalidation automatically
      onSuccess()
      onClose()
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={isEditing ? 'Edit Rule' : 'Create New Rule'}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Basic Information</h3>

          <div>
            <label className="block text-sm font-medium">
              Name <span className="text-red-500">*</span>
            </label>
            <div className="mt-1">
              <TextInput
                {...register('name')}
                placeholder="e.g., Coffee Purchase Rule"
                error={errors.name?.message}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">Description</label>
            <div className="mt-1">
              <Textarea
                {...register('description')}
                placeholder="Optional description of what this rule does"
                rows={2}
              />
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium">
                Priority <span className="text-red-500">*</span>
              </label>
              <div className="mt-1">
                <NumberInput
                  {...register('priority')}
                  placeholder="100"
                  error={errors.priority?.message}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Higher priority rules run first
              </p>
            </div>

            <div className="flex flex-col gap-3 pt-6">
              <Controller
                name="enabled"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    label="Enabled"
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                  />
                )}
              />

              <Controller
                name="allowManualSelection"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    label="Allow manual selection"
                    description="When enabled, this rule will appear in the manual rule dropdown during import review"
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                  />
                )}
              />
            </div>
          </div>
        </div>

        {/* Selector */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Match Condition</h3>
          <p className="text-sm text-gray-600">
            Define when this rule should be applied
          </p>
          <Controller
            name="selector"
            control={control}
            render={({ field }) => (
              <SelectorBuilder
                selector={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </div>

        {/* Actions */}
        <div className="space-y-4">
          <Controller
            name="actions"
            control={control}
            render={({ field }) => (
              <ActionBuilder
                actions={field.value}
                onChange={field.onChange}
                userVariables={userVariables}
              />
            )}
          />
          {errors.actions?.message && (
            <p className="text-sm text-red-600">{errors.actions.message}</p>
          )}
        </div>

        {/* Expectations (Optional) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">
              Expectations (Optional Validation)
            </h3>
            <Controller
              name="showExpectations"
              control={control}
              render={({ field }) => (
                <button
                  type="button"
                  onClick={() => field.onChange(!field.value)}
                  className="text-sm text-blue-500 hover:text-blue-600"
                >
                  {field.value ? 'Hide' : 'Show'} Expectations
                </button>
              )}
            />
          </div>

          {showExpectations && (
            <div className="space-y-3 rounded border border-gray-300 bg-gray-50 p-4">
              <p className="text-sm text-gray-600">
                Set expectations to validate matched transactions and generate
                warnings
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium">
                    Min Amount
                  </label>
                  <div className="mt-1">
                    <NumberInput
                      step="0.01"
                      {...register('minAmount')}
                      placeholder="e.g., 5.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    Max Amount
                  </label>
                  <div className="mt-1">
                    <NumberInput
                      step="0.01"
                      {...register('maxAmount')}
                      placeholder="e.g., 50.00"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium">Currency</label>
                <div className="mt-1">
                  <TextInput
                    {...register('currency')}
                    placeholder="e.g., USD"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error/Success Messages */}
        {serverError && (
          <div className="rounded bg-red-50 p-3 text-sm text-red-700">
            {serverError}
          </div>
        )}

        {/* Form Actions */}
        <div className="flex justify-end gap-3 border-t pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={createMutation.isPending || updateMutation.isPending}
            className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              createMutation.isPending ||
              updateMutation.isPending ||
              actions.length === 0
            }
            className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {createMutation.isPending || updateMutation.isPending
              ? isEditing
                ? 'Updating...'
                : 'Creating...'
              : isEditing
                ? 'Update Rule'
                : 'Create Rule'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
