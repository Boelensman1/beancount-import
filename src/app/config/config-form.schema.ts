import { z } from 'zod'

// Trims string and converts empty/whitespace to undefined
const optionalTrimmedString = z
  .string()
  .optional()
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  .transform((s) => s?.trim() || undefined)

export const AccountFormSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Account name is required'),
  defaultOutputFile: z.string().min(1, 'Output file is required'),
  csvFilename: z.string().min(1, 'CSV filename is required'),
  beangulpCommand: optionalTrimmedString,
  postProcessCommand: optionalTrimmedString,
  csvPostProcessCommand: optionalTrimmedString,
})

export const ConfigFormSchema = z.object({
  defaults: z.object({
    beangulpCommand: z.string().min(1, 'Beangulp command is required'),
    postProcessCommand: optionalTrimmedString,
    csvPostProcessCommand: optionalTrimmedString,
  }),
  goCardless: z
    .object({
      secretId: z.string(),
      secretKey: z.string(),
    })
    .optional(),
  accounts: z.array(AccountFormSchema),
})

export type AccountFormData = z.infer<typeof AccountFormSchema>
export type ConfigFormData = z.infer<typeof ConfigFormSchema>
// Input type for form fields (before transform)
export type ConfigFormInput = z.input<typeof ConfigFormSchema>
