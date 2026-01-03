import { z } from 'zod'
import { Temporal } from '@js-temporal/polyfill'

/**
 * Zod transform schema for Temporal.PlainDate
 * Stores as ISO string (YYYY-MM-DD), transforms to/from Temporal.PlainDate
 */
export const TemporalPlainDateSchema = z
  .string()
  .refine(
    (val) => {
      try {
        Temporal.PlainDate.from(val)
        return true
      } catch {
        return false
      }
    },
    { message: 'Invalid ISO date format (expected YYYY-MM-DD)' },
  )
  .transform((val) => Temporal.PlainDate.from(val))

/**
 * Zod transform schema for Temporal.Instant
 * Stores as ISO 8601 string, transforms to/from Temporal.Instant
 */
export const TemporalInstantSchema = z
  .string()
  .refine(
    (val) => {
      try {
        Temporal.Instant.from(val)
        return true
      } catch {
        return false
      }
    },
    { message: 'Invalid ISO 8601 timestamp format' },
  )
  .transform((val) => Temporal.Instant.from(val))

/**
 * User-defined variable schema
 */
export const UserVariableSchema = z.object({
  id: z.uuid({ version: 'v4' }),
  name: z.string().regex(/^[a-zA-Z]\w*$/, {
    message:
      'Variable name must start with a letter and contain only letters, numbers, underscores',
  }),
  value: z.string(),
  description: z.string().optional(),
})

/**
 * Selector schemas - define how to match transactions
 */

// Individual selector condition types
export const AccountSelectorSchema = z.object({
  type: z.literal('account'),
  pattern: z.string(),
  matchType: z.enum(['regex', 'glob', 'exact']),
})

export const NarrationSelectorSchema = z.object({
  type: z.literal('narration'),
  pattern: z.string(),
  matchType: z.enum(['regex', 'substring', 'exact']),
  caseSensitive: z.boolean().optional(),
})

export const PayeeSelectorSchema = z.object({
  type: z.literal('payee'),
  pattern: z.string(),
  matchType: z.enum(['regex', 'substring', 'exact']),
  caseSensitive: z.boolean().optional(),
})

export const AmountSelectorSchema = z.object({
  type: z.literal('amount'),
  min: z.number().optional(),
  max: z.number().optional(),
  currency: z.string().optional(),
})

export const DateSelectorSchema = z.object({
  type: z.literal('date'),
  after: z.string().optional(), // ISO date
  before: z.string().optional(), // ISO date
})

export const FlagSelectorSchema = z.object({
  type: z.literal('flag'),
  flag: z.string(),
})

export const TagSelectorSchema = z.object({
  type: z.literal('tag'),
  tag: z.string(),
})

export const NeverSelectorSchema = z.object({
  type: z.literal('never'),
})

// Union of all selector conditions
export const SelectorConditionSchema = z.discriminatedUnion('type', [
  AccountSelectorSchema,
  NarrationSelectorSchema,
  PayeeSelectorSchema,
  AmountSelectorSchema,
  DateSelectorSchema,
  FlagSelectorSchema,
  TagSelectorSchema,
  NeverSelectorSchema,
])

// Recursive selector expression types (AND/OR/NOT logic)
type SelectorExpression =
  | z.infer<typeof SelectorConditionSchema>
  | {
      type: 'and' | 'or'
      conditions: SelectorExpression[]
    }
  | {
      type: 'not'
      condition: SelectorExpression
    }

export const SelectorExpressionSchema: z.ZodType<SelectorExpression> = z.lazy(
  () =>
    z.discriminatedUnion('type', [
      AccountSelectorSchema,
      NarrationSelectorSchema,
      PayeeSelectorSchema,
      AmountSelectorSchema,
      DateSelectorSchema,
      FlagSelectorSchema,
      TagSelectorSchema,
      NeverSelectorSchema,
      z.object({
        type: z.literal('and'),
        conditions: z.array(SelectorExpressionSchema),
      }),
      z.object({
        type: z.literal('or'),
        conditions: z.array(SelectorExpressionSchema),
      }),
      z.object({
        type: z.literal('not'),
        condition: SelectorExpressionSchema,
      }),
    ]),
)

/**
 * Action schemas - define transformations to apply to matched transactions
 */

export const ModifyNarrationActionSchema = z.object({
  type: z.literal('modify_narration'),
  operation: z.enum(['replace', 'prepend', 'append', 'regex_replace']),
  value: z.string(),
  pattern: z.string().optional(), // Required for 'regex_replace'
})

export const ModifyPayeeActionSchema = z.object({
  type: z.literal('modify_payee'),
  operation: z.enum(['replace', 'set_if_empty']),
  value: z.string(),
})

export const AddPostingActionSchema = z.object({
  type: z.literal('add_posting'),
  account: z.string(),
  amount: z
    .object({
      value: z.string(),
      currency: z.string(),
    })
    .optional(),
  metadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
})

export const ModifyPostingActionSchema = z.object({
  type: z.literal('modify_posting'),
  selector: z.object({
    accountPattern: z.string().optional(),
    index: z.number().optional(),
  }),
  newAccount: z.string().optional(),
  newAmount: z
    .object({
      value: z.string(),
      currency: z.string(),
    })
    .optional(),
})

export const AddMetadataActionSchema = z.object({
  type: z.literal('add_metadata'),
  key: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
  overwrite: z.boolean().optional(),
})

export const AddTagActionSchema = z.object({
  type: z.literal('add_tag'),
  tag: z.string(),
})

export const AddLinkActionSchema = z.object({
  type: z.literal('add_link'),
  link: z.string(),
})

export const AddCommentActionSchema = z.object({
  type: z.literal('add_comment'),
  comment: z.string(),
  position: z.enum(['before', 'after']),
})

export const SetFlagActionSchema = z.object({
  type: z.literal('set_flag'),
  flag: z.string(),
})

export const SetOutputFileActionSchema = z.object({
  type: z.literal('set_output_file'),
  outputFile: z.string(),
  keepCommentedCopy: z.boolean().optional(),
})

// Union of all action types
export const ActionSchema = z.discriminatedUnion('type', [
  ModifyNarrationActionSchema,
  ModifyPayeeActionSchema,
  AddPostingActionSchema,
  ModifyPostingActionSchema,
  AddMetadataActionSchema,
  AddTagActionSchema,
  AddLinkActionSchema,
  AddCommentActionSchema,
  SetFlagActionSchema,
  SetOutputFileActionSchema,
])

/**
 * Rule schema - defines a processing rule for transactions
 */
export const RuleSchema = z.object({
  id: z.uuid({ version: 'v4' }), // UUID
  name: z.string(),
  description: z.string().optional(),
  enabled: z.boolean(),
  priority: z.number(),
  selector: SelectorExpressionSchema,
  allowManualSelection: z.boolean().default(false), // Whether this rule can be manually selected during import review
  expectations: z
    .object({
      minAmount: z.number().optional(),
      maxAmount: z.number().optional(),
      currency: z.string().optional(),
    })
    .optional(),
  actions: z.array(ActionSchema),
})

/**
 * GoCardless integration configuration for an account
 */
export const GoCardlessAccountConfigSchema = z.object({
  countryCode: z.string(),
  bankId: z.string(),
  reqRef: z.string(),
  accounts: z.array(z.uuid({ version: 'v4' })), // GoCardless API account IDs
  importedTill: TemporalPlainDateSchema,
  endUserAgreementValidTill: TemporalInstantSchema,
})

/**
 * Processed transaction schema - stores a transaction with before/after states
 */
export const ProcessedTransactionSchema = z.object({
  id: z.uuid({ version: 'v4' }), // UUID for this processed transaction
  originalTransaction: z.string(), // JSON serialized Transaction (before rules)
  processedEntries: z.string(), // JSON serialized Entry[] (after rules)
  matchedRules: z.array(
    z.object({
      ruleId: z.uuid({ version: 'v4' }),
      ruleName: z.string(),
      actionsApplied: z.array(z.string()),
      applicationType: z.enum(['automatic', 'manual']).default('automatic'), // Whether the rule was applied automatically or manually
    }),
  ),
  warnings: z.array(z.string()),
  skippedRuleIds: z.array(z.uuid({ version: 'v4' })).default([]), // Rule IDs to skip when re-running rules
})

/**
 * Defaults schema - contains default settings for all accounts
 */
export const DefaultsSchema = z.object({
  beangulpCommand: z.string(),
  postProcessCommand: z.string().optional(),
  csvPostProcessCommand: z.string().optional(),
})

/**
 * Config schema - contains application configuration
 */
export const ConfigSchema = z.object({
  defaults: DefaultsSchema.default({ beangulpCommand: '' }),
  goCardless: z
    .object({
      secretId: z.string(),
      secretKey: z.string(),
    })
    .optional(),
  accounts: z.array(
    z.object({
      id: z.uuid({ version: 'v4' }), // UUID
      name: z.string(),
      defaultOutputFile: z.string(),
      csvFilename: z.string().default(''),
      beangulpCommand: z.string().optional(), // Per-account beangulp command override
      postProcessCommand: z.string().optional(), // Per-account post-process command override
      csvPostProcessCommand: z.string().optional(), // Per-account CSV post-process command override
      rules: z.array(RuleSchema).default([]), // Per-account processing rules
      variables: z.array(UserVariableSchema).default([]), // Per-account user-defined variables
      goCardless: GoCardlessAccountConfigSchema.optional(), // Optional GoCardless configuration
    }),
  ),
})

/**
 * Batch import schema - groups multiple account imports together
 */
export const BatchImportSchema = z.object({
  id: z.uuid({ version: 'v4' }), // UUID
  timestamp: z.string(), // ISO 8601 timestamp
  importIds: z.array(z.uuid({ version: 'v4' })), // UUIDs of ImportResults in this batch
  accountIds: z.array(z.uuid({ version: 'v4' })), // UUIDs of accounts in this batch
  completedCount: z.number().default(0), // Number of completed imports (success or failure)
})

/**
 * Import result schema - stores parsed beancount import results
 */
export const ImportResultSchema = z.object({
  id: z.uuid({ version: 'v4' }), // UUID
  accountId: z.uuid({ version: 'v4' }), // UUID reference to account
  batchId: z.uuid({ version: 'v4' }), // UUID reference to batch
  timestamp: z.string(), // ISO 8601 timestamp
  transactions: z.array(ProcessedTransactionSchema), // Array of processed transactions
  transactionCount: z.number(), // Number of transaction entries
  csvPath: z.string(), // Path to the CSV file used for import
  importedFrom: z.string().optional(), // ISO date (YYYY-MM-DD) - start of import range
  importedTo: z.string().optional(), // ISO date (YYYY-MM-DD) - end of import range
})

/**
 * Global variables schema
 */
export const GlobalVariablesSchema = z.object({
  global: z.array(UserVariableSchema).default([]),
})

/**
 * Database schema - root structure of the database
 */
export const DatabaseSchema = z.object({
  config: ConfigSchema,
  imports: z.array(ImportResultSchema).default([]),
  batches: z.array(BatchImportSchema).default([]),
  variables: GlobalVariablesSchema.default({ global: [] }),
})
