import { z } from 'zod'

export const VariableFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Variable name is required')
    .regex(
      /^[a-zA-Z]\w*$/,
      'Variable name must start with a letter and contain only letters, numbers, underscores',
    ),
  value: z.string().min(1, 'Value is required'),
  description: z.string().optional(),
})

export type VariableFormData = z.infer<typeof VariableFormSchema>
