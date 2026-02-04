import { z } from 'zod'
import {
  ConfigSchema,
  DatabaseSchema,
  ImportResultSchema,
  RuleSchema,
  ProcessedTransactionSchema,
  SelectorExpressionSchema,
  ActionSchema,
  AccountSelectorSchema,
  NarrationSelectorSchema,
  PayeeSelectorSchema,
  AmountSelectorSchema,
  DateSelectorSchema,
  FlagSelectorSchema,
  TagSelectorSchema,
  NeverSelectorSchema,
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
  DefaultsSchema,
  GoCardlessAccountConfigSchema,
  UserVariableSchema,
  GlobalVariablesSchema,
} from './schema'
import type { serializeDatabase } from './serialization'

/**
 * TypeScript type for Defaults object
 * Inferred from Zod schema for type safety
 */
export type Defaults = z.infer<typeof DefaultsSchema>

/**
 * TypeScript type for GoCardless account configuration
 * Inferred from Zod schema with Temporal objects (not ISO strings)
 */
export type GoCardlessAccountConfig = z.infer<
  typeof GoCardlessAccountConfigSchema
>

/**
 * TypeScript type for Account object
 * Inferred from the account schema within ConfigSchema
 */
export type Account = z.infer<typeof ConfigSchema>['accounts'][number]

/**
 * TypeScript type for Config object
 * Inferred from Zod schema for type safety
 */
export type Config = z.infer<typeof ConfigSchema>

/**
 * TypeScript type for ImportResult object
 * Inferred from Zod schema for type safety
 */
export type ImportResult = z.infer<typeof ImportResultSchema>

/**
 * TypeScript type for ProcessedTransaction object
 * Inferred from Zod schema for type safety
 */
export type ProcessedTransaction = z.infer<typeof ProcessedTransactionSchema>

/**
 * TypeScript type for the entire Database
 * Inferred from Zod schema for type safety
 */
export type Database = z.infer<typeof DatabaseSchema>

// Serialized db types
export type SerializedDatabase = ReturnType<typeof serializeDatabase>
export type SerializedConfig = SerializedDatabase['config']
export type SerializedAccount = SerializedConfig['accounts'][number]

// Extended account type with computed pending import status
export type AccountWithPendingStatus = SerializedAccount & {
  hasPendingImport: boolean
}

/**
 * Rule-related types
 */

// Selector types
export type SelectorExpression = z.infer<typeof SelectorExpressionSchema>
export type AccountSelector = z.infer<typeof AccountSelectorSchema>
export type NarrationSelector = z.infer<typeof NarrationSelectorSchema>
export type PayeeSelector = z.infer<typeof PayeeSelectorSchema>
export type AmountSelector = z.infer<typeof AmountSelectorSchema>
export type DateSelector = z.infer<typeof DateSelectorSchema>
export type FlagSelector = z.infer<typeof FlagSelectorSchema>
export type TagSelector = z.infer<typeof TagSelectorSchema>
export type NeverSelector = z.infer<typeof NeverSelectorSchema>

// Action types
export type Action = z.infer<typeof ActionSchema>
export type ModifyNarrationAction = z.infer<typeof ModifyNarrationActionSchema>
export type ModifyPayeeAction = z.infer<typeof ModifyPayeeActionSchema>
export type AddPostingAction = z.infer<typeof AddPostingActionSchema>
export type ModifyPostingAction = z.infer<typeof ModifyPostingActionSchema>
export type AddMetadataAction = z.infer<typeof AddMetadataActionSchema>
export type AddTagAction = z.infer<typeof AddTagActionSchema>
export type AddLinkAction = z.infer<typeof AddLinkActionSchema>
export type AddCommentAction = z.infer<typeof AddCommentActionSchema>
export type SetFlagAction = z.infer<typeof SetFlagActionSchema>
export type SetOutputFileAction = z.infer<typeof SetOutputFileActionSchema>

// Rule types
export type Rule = z.infer<typeof RuleSchema>

// Variable types
export type UserVariable = z.infer<typeof UserVariableSchema>
export type GlobalVariables = z.infer<typeof GlobalVariablesSchema>
