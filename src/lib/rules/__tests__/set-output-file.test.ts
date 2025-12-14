/**
 * Tests for set_output_file action
 */
import { Temporal } from '@js-temporal/polyfill'
import { describe, it, expect } from 'vitest'
import { Value } from 'beancount'
import type { Action } from '@/lib/db/types'
import {
  createMockTransaction,
  createMockPosting,
  createMockRule,
  createNarrationSelector,
} from '@/test/test-utils'

import { applyAction } from '../actions'
import { processTransaction } from '../engine'

describe('set_output_file', () => {
  it('should set outputFile in internalMetadata', () => {
    const transaction = createMockTransaction()
    const action: Action = {
      type: 'set_output_file',
      outputFile: '/path/to/output.beancount',
    }

    applyAction(transaction, action)

    expect(transaction.internalMetadata).toBeDefined()
    expect(
      (transaction.internalMetadata as Record<string, unknown> | undefined)
        ?.outputFile,
    ).toBe('/path/to/output.beancount')
  })

  it('should overwrite existing outputFile', () => {
    const transaction = createMockTransaction()
    transaction.internalMetadata = {
      outputFile: '/old/path.beancount',
    }
    const action: Action = {
      type: 'set_output_file',
      outputFile: '/new/path.beancount',
    }

    applyAction(transaction, action)

    expect(
      (transaction.internalMetadata as Record<string, unknown> | undefined)
        ?.outputFile,
    ).toBe('/new/path.beancount')
  })

  it('should preserve other internalMetadata properties', () => {
    const transaction = createMockTransaction()
    transaction.internalMetadata = {
      customProperty: 'test-value',
      anotherProperty: 123,
    }
    const action: Action = {
      type: 'set_output_file',
      outputFile: '/path/to/output.beancount',
    }

    applyAction(transaction, action)

    expect(
      (transaction.internalMetadata as Record<string, unknown> | undefined)
        ?.outputFile,
    ).toBe('/path/to/output.beancount')
    expect(
      (transaction.internalMetadata as Record<string, unknown> | undefined)
        ?.customProperty,
    ).toBe('test-value')
    expect(
      (transaction.internalMetadata as Record<string, unknown> | undefined)
        ?.anotherProperty,
    ).toBe(123)
  })

  it('should handle empty outputFile string', () => {
    const transaction = createMockTransaction()
    const action: Action = {
      type: 'set_output_file',
      outputFile: '',
    }

    applyAction(transaction, action)

    expect(
      (transaction.internalMetadata as Record<string, unknown> | undefined)
        ?.outputFile,
    ).toBe('')
  })

  it('should handle paths with spaces', () => {
    const transaction = createMockTransaction()
    const action: Action = {
      type: 'set_output_file',
      outputFile: '/path with spaces/my output.beancount',
    }

    applyAction(transaction, action)

    expect(
      (transaction.internalMetadata as Record<string, unknown> | undefined)
        ?.outputFile,
    ).toBe('/path with spaces/my output.beancount')
  })

  it('should handle Windows-style paths', () => {
    const transaction = createMockTransaction()
    const action: Action = {
      type: 'set_output_file',
      outputFile: 'C:\\Users\\Documents\\output.beancount',
    }

    applyAction(transaction, action)

    expect(
      (transaction.internalMetadata as Record<string, unknown> | undefined)
        ?.outputFile,
    ).toBe('C:\\Users\\Documents\\output.beancount')
  })

  it('should be applied when rule matches', () => {
    const transaction = createMockTransaction({
      narration: 'Test transaction',
    })
    const rule = createMockRule({
      selector: createNarrationSelector('Test', 'substring'),
      actions: [
        {
          type: 'set_output_file',
          outputFile: '/custom/output.beancount',
        },
      ],
    })

    const result = processTransaction(transaction, [rule])

    expect(result.matchedRules).toHaveLength(1)
    expect(result.matchedRules[0].actionsApplied).toContain('set_output_file')
    expect(
      (transaction.internalMetadata as Record<string, unknown> | undefined)
        ?.outputFile,
    ).toBe('/custom/output.beancount')
  })

  it('should allow multiple rules to change outputFile', () => {
    const transaction = createMockTransaction({
      narration: 'Test transaction',
    })
    const rule1 = createMockRule({
      id: 'rule-1',
      name: 'Rule 1',
      priority: 10,
      selector: createNarrationSelector('Test', 'substring'),
      actions: [
        {
          type: 'set_output_file',
          outputFile: '/first/output.beancount',
        },
      ],
    })
    const rule2 = createMockRule({
      id: 'rule-2',
      name: 'Rule 2',
      priority: 5,
      selector: createNarrationSelector('Test', 'substring'),
      actions: [
        {
          type: 'set_output_file',
          outputFile: '/second/output.beancount',
        },
      ],
    })

    const result = processTransaction(transaction, [rule1, rule2])

    expect(result.matchedRules).toHaveLength(2)
    // Last rule wins (lower priority runs later)
    expect(
      (transaction.internalMetadata as Record<string, unknown> | undefined)
        ?.outputFile,
    ).toBe('/second/output.beancount')
  })

  it('should work with relative paths', () => {
    const transaction = createMockTransaction()
    const action: Action = {
      type: 'set_output_file',
      outputFile: './relative/path/output.beancount',
    }

    applyAction(transaction, action)

    expect(
      (transaction.internalMetadata as Record<string, unknown> | undefined)
        ?.outputFile,
    ).toBe('./relative/path/output.beancount')
  })

  it('should work with just a filename', () => {
    const transaction = createMockTransaction()
    const action: Action = {
      type: 'set_output_file',
      outputFile: 'output.beancount',
    }

    applyAction(transaction, action)

    expect(
      (transaction.internalMetadata as Record<string, unknown> | undefined)
        ?.outputFile,
    ).toBe('output.beancount')
  })

  describe('variable replacement', () => {
    it('should replace variables in outputFile path', () => {
      const transaction = createMockTransaction({
        metadata: {
          category: new Value({ type: 'string', value: 'Food' }),
        },
      })
      const action: Action = {
        type: 'set_output_file',
        outputFile: '/output/$metadata_category.beancount',
      }

      applyAction(transaction, action)

      expect(
        (transaction.internalMetadata as Record<string, unknown> | undefined)
          ?.outputFile,
      ).toBe('/output/Food.beancount')
    })

    it('should create dynamic paths based on transaction data', () => {
      const transaction = createMockTransaction({
        date: Temporal.PlainDate.from('2024-01-15'),
        payee: 'Starbucks',
      })
      const action: Action = {
        type: 'set_output_file',
        outputFile: '/transactions/$date/$payee.beancount',
      }

      applyAction(transaction, action)

      expect(
        (transaction.internalMetadata as Record<string, unknown> | undefined)
          ?.outputFile,
      ).toBe('/transactions/2024-01-15/Starbucks.beancount')
    })

    it('should support date-based file organization', () => {
      const transaction = createMockTransaction({
        date: Temporal.PlainDate.from('2024-03-15'),
      })
      const action: Action = {
        type: 'set_output_file',
        outputFile: '/output/$date.beancount',
      }

      applyAction(transaction, action)

      expect(
        (transaction.internalMetadata as Record<string, unknown> | undefined)
          ?.outputFile,
      ).toBe('/output/2024-03-15.beancount')
    })

    it('should replace posting variables in path', () => {
      const transaction = createMockTransaction({
        postings: [
          createMockPosting({
            account: 'Assets:Checking',
            currency: 'USD',
          }),
        ],
      })
      const action: Action = {
        type: 'set_output_file',
        outputFile: '/output/$postingCurrency[0]/transactions.beancount',
      }

      applyAction(transaction, action)

      expect(
        (transaction.internalMetadata as Record<string, unknown> | undefined)
          ?.outputFile,
      ).toBe('/output/USD/transactions.beancount')
    })

    it('should handle complex path expressions', () => {
      const transaction = createMockTransaction({
        date: Temporal.PlainDate.from('2024-01-15'),
        metadata: {
          category: new Value({ type: 'string', value: 'Food' }),
          subcategory: new Value({ type: 'string', value: 'Groceries' }),
        },
      })
      const action: Action = {
        type: 'set_output_file',
        outputFile:
          '/output/$date/$metadata_category/$metadata_subcategory.beancount',
      }

      applyAction(transaction, action)

      expect(
        (transaction.internalMetadata as Record<string, unknown> | undefined)
          ?.outputFile,
      ).toBe('/output/2024-01-15/Food/Groceries.beancount')
    })

    it('should handle narration in filename', () => {
      const transaction = createMockTransaction({
        narration: 'Weekly Groceries',
      })
      const action: Action = {
        type: 'set_output_file',
        outputFile: '/output/$narration.beancount',
      }

      applyAction(transaction, action)

      expect(
        (transaction.internalMetadata as Record<string, unknown> | undefined)
          ?.outputFile,
      ).toBe('/output/Weekly Groceries.beancount')
    })

    it('should throw error for undefined variable', () => {
      const transaction = createMockTransaction()
      const action: Action = {
        type: 'set_output_file',
        outputFile: '/output/$undefinedVariable.beancount',
      }

      expect(() => applyAction(transaction, action)).toThrow(
        "Variable '$undefinedVariable' is not defined",
      )
    })
  })
})
