import { z } from 'zod'

export const AccountFormSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Account name is required'),
  defaultOutputFile: z.string().min(1, 'Output file is required'),
  csvFilename: z.string().min(1, 'CSV filename is required'),
  beangulpCommand: z.string().optional(),
  postProcessCommand: z.string().optional(),
  csvPostProcessCommand: z.string().optional(),
})

export const ConfigFormSchema = z.object({
  defaults: z.object({
    beangulpCommand: z.string().min(1, 'Beangulp command is required'),
    postProcessCommand: z.string().optional(),
    csvPostProcessCommand: z.string().optional(),
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
