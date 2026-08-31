/**
 * Tests for per-action transaction targeting (the `target` field on actions)
 */
import { describe, it, expect } from 'vitest'
import type { Node, Transaction } from 'beancount'
import type { ActionTarget } from '@/lib/db/types'
import {
  createMockTransaction,
  createMockRule,
  createNarrationSelector,
} from '@/test/test-utils'
import { ActionSchema } from '@/lib/db/schema'

import { processTransaction, applyRuleManually } from '../engine'

/**
 * A rule that adds a second transaction, then tags with the given target
 */
function createFanOutRule(target?: ActionTarget) {
  return createMockRule({
    selector: createNarrationSelector('Original', 'substring'),
    actions: [
      {
        type: 'add_transaction',
        position: 'after',
        narration: 'Generated',
        postings: [],
      },
      { type: 'add_tag', tag: 'tagged', target },
    ],
  })
}

/**
 * Tags of every transaction node, in order
 */
function tagsPerTransaction(nodes: Node[]): string[][] {
  return nodes
    .filter((node) => node.type === 'transaction')
    .map((node) => (node as Transaction).tags.map((tag) => tag.content))
}

describe('action targeting', () => {
  it('should apply to every transaction when no target is set', () => {
    const transaction = createMockTransaction({ narration: 'Original' })

    const result = processTransaction(transaction, [createFanOutRule()])

    expect(tagsPerTransaction(result.nodes)).toEqual([['tagged'], ['tagged']])
  })

  it('should apply to every transaction for the explicit "all" target', () => {
    const transaction = createMockTransaction({ narration: 'Original' })

    const result = processTransaction(transaction, [
      createFanOutRule({ mode: 'all' }),
    ])

    expect(tagsPerTransaction(result.nodes)).toEqual([['tagged'], ['tagged']])
  })

  it('should apply only to the first transaction', () => {
    const transaction = createMockTransaction({ narration: 'Original' })

    const result = processTransaction(transaction, [
      createFanOutRule({ mode: 'first' }),
    ])

    expect(tagsPerTransaction(result.nodes)).toEqual([['tagged'], []])
    expect((result.nodes[0] as Transaction).narration).toBe('Original')
  })

  it('should apply only to the last transaction', () => {
    const transaction = createMockTransaction({ narration: 'Original' })

    const result = processTransaction(transaction, [
      createFanOutRule({ mode: 'last' }),
    ])

    expect(tagsPerTransaction(result.nodes)).toEqual([[], ['tagged']])
    expect((result.nodes[1] as Transaction).narration).toBe('Generated')
  })

  it('should apply only to the transaction at the given index', () => {
    const transaction = createMockTransaction({ narration: 'Original' })

    const result = processTransaction(transaction, [
      createFanOutRule({ mode: 'index', index: 1 }),
    ])

    expect(tagsPerTransaction(result.nodes)).toEqual([[], ['tagged']])
  })

  it('should treat a missing index as 0', () => {
    const transaction = createMockTransaction({ narration: 'Original' })

    const result = processTransaction(transaction, [
      createFanOutRule({ mode: 'index' }),
    ])

    expect(tagsPerTransaction(result.nodes)).toEqual([['tagged'], []])
  })

  it('should warn and skip when the index is out of range', () => {
    const transaction = createMockTransaction({ narration: 'Original' })

    const result = processTransaction(transaction, [
      createFanOutRule({ mode: 'index', index: 5 }),
    ])

    expect(tagsPerTransaction(result.nodes)).toEqual([[], []])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('add_tag')
    expect(result.warnings[0]).toContain('#5')
    expect(result.warnings[0]).toContain('2 transaction(s)')
  })

  it('should count only transaction nodes, ignoring comments', () => {
    const transaction = createMockTransaction({ narration: 'Original' })
    const rule = createMockRule({
      selector: createNarrationSelector('Original', 'substring'),
      actions: [
        { type: 'add_comment', comment: 'Heads up', position: 'before' },
        {
          type: 'add_transaction',
          position: 'after',
          narration: 'Generated',
          postings: [],
        },
        { type: 'add_tag', tag: 'tagged', target: { mode: 'first' } },
      ],
    })

    const result = processTransaction(transaction, [rule])

    // Comment, original, generated
    expect(result.nodes).toHaveLength(3)
    expect(result.nodes[0].type).toBe('comment')
    expect(tagsPerTransaction(result.nodes)).toEqual([['tagged'], []])
  })

  it('should target transactions produced by an earlier rule', () => {
    const transaction = createMockTransaction({ narration: 'Original' })
    const addingRule = createMockRule({
      id: 'rule-adding',
      priority: 100,
      selector: createNarrationSelector('Original', 'substring'),
      actions: [
        {
          type: 'add_transaction',
          position: 'after',
          narration: 'Generated',
          postings: [],
        },
      ],
    })
    const taggingRule = createMockRule({
      id: 'rule-tagging',
      priority: 50,
      selector: createNarrationSelector('Original', 'substring'),
      actions: [{ type: 'add_tag', tag: 'tagged', target: { mode: 'last' } }],
    })

    const result = processTransaction(transaction, [addingRule, taggingRule])

    expect(tagsPerTransaction(result.nodes)).toEqual([[], ['tagged']])
  })

  it('should honour the target when a rule is applied manually', () => {
    const transaction = createMockTransaction({ narration: 'Original' })

    const result = applyRuleManually(
      transaction,
      createFanOutRule({ mode: 'last' }),
    )

    expect(tagsPerTransaction(result.nodes)).toEqual([[], ['tagged']])
  })

  it('should parse a stored action that has no target', () => {
    const parsed = ActionSchema.parse({ type: 'add_tag', tag: 'legacy' })

    expect(parsed).toEqual({ type: 'add_tag', tag: 'legacy' })
  })
})
