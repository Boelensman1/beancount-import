import { z } from 'zod'
import {
  ConfigSchema,
  DatabaseSchema,
  ImportResultSchema,
  BatchImportSchema,
  RuleSchema,
  RuleExecutionResultSchema,
  SelectorExpressionSchema,
  ActionSchema,
  AccountSelectorSchema,
  NarrationSelectorSchema,
  PayeeSelectorSchema,
  AmountSelectorSchema,
  DateSelectorSchema,
  FlagSelectorSchema,
  TagSelectorSchema,
  ModifyNarrationActionSchema,
  ModifyPayeeActionSchema,
  AddPostingActionSchema,
  ModifyPostingActionSchema,
  AddMetadataActionSchema,
  AddTagActionSchema,
  AddLinkActionSchema,
  AddCommentActionSchema,
  SetFlagActionSchema,
} from './schema'

/**
 * TypeScript type for Account object (now includes rules)
 */
export type Account = {
  id: string
  name: string
  importerCommand: string
  rules: Rule[]
}

/**
 * TypeScript type for Config object
 * Inferred from Zod schema for type safety
 */
export type Config = z.infer<typeof ConfigSchema>

/**
 * TypeScript type for BatchImport object
 * Inferred from Zod schema for type safety
 */
export type BatchImport = z.infer<typeof BatchImportSchema>

/**
 * TypeScript type for ImportResult object
 * Inferred from Zod schema for type safety
 */
export type ImportResult = z.infer<typeof ImportResultSchema>

/**
 * TypeScript type for the entire Database
 * Inferred from Zod schema for type safety
 */
export type Database = z.infer<typeof DatabaseSchema>

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

// Rule types
export type Rule = z.infer<typeof RuleSchema>
export type RuleExecutionResult = z.infer<typeof RuleExecutionResultSchema>
