import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SelectorBuilder } from './selector-builder'
import type { SelectorExpression } from '@/lib/db/types'

// Helper to get the selector type dropdown (first combobox in the component)
function getSelectorTypeSelect(): HTMLSelectElement {
  const selects = screen.getAllByRole('combobox')
  return selects[0] as HTMLSelectElement
}

describe('SelectorBuilder type change behavior', () => {
  describe('non-recursive to AND', () => {
    it('wraps payee selector as first condition when changing to AND', () => {
      const onChange = vi.fn()
      const payeeSelector: SelectorExpression = {
        type: 'payee',
        pattern: 'Starbucks',
        matchType: 'substring',
      }
      render(<SelectorBuilder selector={payeeSelector} onChange={onChange} />)

      const select = getSelectorTypeSelect()
      fireEvent.change(select, { target: { value: 'and' } })

      expect(onChange).toHaveBeenCalledWith({
        type: 'and',
        conditions: [payeeSelector],
      })
    })

    it('wraps account selector as first condition when changing to AND', () => {
      const onChange = vi.fn()
      const accountSelector: SelectorExpression = {
        type: 'account',
        pattern: 'Assets:Bank',
        matchType: 'glob',
      }
      render(<SelectorBuilder selector={accountSelector} onChange={onChange} />)

      const select = getSelectorTypeSelect()
      fireEvent.change(select, { target: { value: 'and' } })

      expect(onChange).toHaveBeenCalledWith({
        type: 'and',
        conditions: [accountSelector],
      })
    })
  })

  describe('non-recursive to OR', () => {
    it('wraps narration selector as first condition when changing to OR', () => {
      const onChange = vi.fn()
      const narrationSelector: SelectorExpression = {
        type: 'narration',
        pattern: 'Coffee',
        matchType: 'substring',
        caseSensitive: true,
      }
      render(
        <SelectorBuilder selector={narrationSelector} onChange={onChange} />,
      )

      const select = getSelectorTypeSelect()
      fireEvent.change(select, { target: { value: 'or' } })

      expect(onChange).toHaveBeenCalledWith({
        type: 'or',
        conditions: [narrationSelector],
      })
    })

    it('wraps amount selector as first condition when changing to OR', () => {
      const onChange = vi.fn()
      const amountSelector: SelectorExpression = {
        type: 'amount',
        min: 100,
        max: 500,
        currency: 'USD',
      }
      render(<SelectorBuilder selector={amountSelector} onChange={onChange} />)

      const select = getSelectorTypeSelect()
      fireEvent.change(select, { target: { value: 'or' } })

      expect(onChange).toHaveBeenCalledWith({
        type: 'or',
        conditions: [amountSelector],
      })
    })
  })

  describe('non-recursive to NOT', () => {
    it('wraps selector as condition when changing to NOT', () => {
      const onChange = vi.fn()
      const amountSelector: SelectorExpression = {
        type: 'amount',
        min: 100,
        max: 500,
      }
      render(<SelectorBuilder selector={amountSelector} onChange={onChange} />)

      const select = getSelectorTypeSelect()
      fireEvent.change(select, { target: { value: 'not' } })

      expect(onChange).toHaveBeenCalledWith({
        type: 'not',
        condition: amountSelector,
      })
    })

    it('wraps date selector as condition when changing to NOT', () => {
      const onChange = vi.fn()
      const dateSelector: SelectorExpression = {
        type: 'date',
        after: '2024-01-01',
        before: '2024-12-31',
      }
      render(<SelectorBuilder selector={dateSelector} onChange={onChange} />)

      const select = getSelectorTypeSelect()
      fireEvent.change(select, { target: { value: 'not' } })

      expect(onChange).toHaveBeenCalledWith({
        type: 'not',
        condition: dateSelector,
      })
    })

    it('wraps never selector as condition when changing to NOT', () => {
      const onChange = vi.fn()
      const neverSelector: SelectorExpression = {
        type: 'never',
      }
      render(<SelectorBuilder selector={neverSelector} onChange={onChange} />)

      const select = getSelectorTypeSelect()
      fireEvent.change(select, { target: { value: 'not' } })

      expect(onChange).toHaveBeenCalledWith({
        type: 'not',
        condition: neverSelector,
      })
    })
  })

  describe('AND/OR swapping', () => {
    it('preserves conditions when swapping from AND to OR', () => {
      const onChange = vi.fn()
      const andSelector: SelectorExpression = {
        type: 'and',
        conditions: [
          { type: 'payee', pattern: 'abc', matchType: 'exact' },
          { type: 'amount', min: 50 },
        ],
      }
      render(<SelectorBuilder selector={andSelector} onChange={onChange} />)

      const select = getSelectorTypeSelect()
      fireEvent.change(select, { target: { value: 'or' } })

      expect(onChange).toHaveBeenCalledWith({
        type: 'or',
        conditions: andSelector.conditions,
      })
    })

    it('preserves conditions when swapping from OR to AND', () => {
      const onChange = vi.fn()
      const orSelector: SelectorExpression = {
        type: 'or',
        conditions: [
          { type: 'narration', pattern: 'test', matchType: 'substring' },
          { type: 'tag', tag: 'vacation' },
          { type: 'flag', flag: '!' },
        ],
      }
      render(<SelectorBuilder selector={orSelector} onChange={onChange} />)

      const select = getSelectorTypeSelect()
      fireEvent.change(select, { target: { value: 'and' } })

      expect(onChange).toHaveBeenCalledWith({
        type: 'and',
        conditions: orSelector.conditions,
      })
    })
  })

  describe('default behavior unchanged', () => {
    it('creates default selector when changing from payee to narration', () => {
      const onChange = vi.fn()
      const payeeSelector: SelectorExpression = {
        type: 'payee',
        pattern: 'test',
        matchType: 'exact',
      }
      render(<SelectorBuilder selector={payeeSelector} onChange={onChange} />)

      const select = getSelectorTypeSelect()
      fireEvent.change(select, { target: { value: 'narration' } })

      expect(onChange).toHaveBeenCalledWith({
        type: 'narration',
        pattern: '',
        matchType: 'substring',
      })
    })

    it('creates default selector when changing from AND to account', () => {
      const onChange = vi.fn()
      const andSelector: SelectorExpression = {
        type: 'and',
        conditions: [{ type: 'payee', pattern: 'test', matchType: 'exact' }],
      }
      render(<SelectorBuilder selector={andSelector} onChange={onChange} />)

      const select = getSelectorTypeSelect()
      fireEvent.change(select, { target: { value: 'account' } })

      expect(onChange).toHaveBeenCalledWith({
        type: 'account',
        pattern: '',
        matchType: 'exact',
      })
    })

    it('creates default selector when changing from NOT to payee', () => {
      const onChange = vi.fn()
      const notSelector: SelectorExpression = {
        type: 'not',
        condition: { type: 'amount', min: 100 },
      }
      render(<SelectorBuilder selector={notSelector} onChange={onChange} />)

      const select = getSelectorTypeSelect()
      fireEvent.change(select, { target: { value: 'payee' } })

      expect(onChange).toHaveBeenCalledWith({
        type: 'payee',
        pattern: '',
        matchType: 'substring',
      })
    })
  })
})
