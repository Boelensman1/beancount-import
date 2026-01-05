import { z } from 'zod'
import { SelectorExpressionSchema, ActionSchema } from '@/lib/db/schema'
import type { SelectorExpression, Action } from '@/lib/db/types'

export const RuleFormSchema = z.object({
  name: z.string().min(1, 'Rule name is required'),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
  priority: z.coerce.number().int().default(100),
  selector: SelectorExpressionSchema,
  allowManualSelection: z.boolean().default(false),
  actions: z.array(ActionSchema).min(1, 'At least one action is required'),
  showExpectations: z.boolean().default(false),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
  currency: z.string().optional(),
})

// Explicitly type RuleFormData since z.lazy() doesn't infer types correctly
export interface RuleFormData {
  name: string
  description?: string
  enabled: boolean
  priority: number
  selector: SelectorExpression
  allowManualSelection: boolean
  actions: Action[]
  showExpectations: boolean
  minAmount?: string
  maxAmount?: string
  currency?: string
}
