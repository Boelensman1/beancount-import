import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  TextInputWithVariableHelp,
  type Variable,
} from '@/app/components/textInputWithVariableHelp'

describe('TextInputWithVariableHelp', () => {
  const mockVariables: Variable[] = [
    { variable: 'account', explanation: 'The account name' },
    { variable: 'date', explanation: 'Transaction date' },
  ]

  it('should render input with help button', () => {
    const onChange = vi.fn()
    render(
      <TextInputWithVariableHelp
        value=""
        onChange={onChange}
        variables={mockVariables}
      />,
    )

    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(
      screen.getByLabelText('Show available variables'),
    ).toBeInTheDocument()
  })

  it('should open modal when help button is clicked', () => {
    const onChange = vi.fn()
    render(
      <TextInputWithVariableHelp
        value=""
        onChange={onChange}
        variables={mockVariables}
      />,
    )

    const helpButton = screen.getByLabelText('Show available variables')
    fireEvent.click(helpButton)

    expect(screen.getByText('Available Variables')).toBeInTheDocument()
    expect(screen.getByText('$account')).toBeInTheDocument()
    expect(screen.getByText('The account name')).toBeInTheDocument()
  })

  it('should close modal when close button is clicked', () => {
    const onChange = vi.fn()
    render(
      <TextInputWithVariableHelp
        value=""
        onChange={onChange}
        variables={mockVariables}
      />,
    )

    fireEvent.click(screen.getByLabelText('Show available variables'))
    expect(screen.getByText('Available Variables')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Close modal'))
    expect(screen.queryByText('Available Variables')).not.toBeInTheDocument()
  })

  it('should close modal on overlay click', () => {
    const onChange = vi.fn()
    render(
      <TextInputWithVariableHelp
        value=""
        onChange={onChange}
        variables={mockVariables}
      />,
    )

    fireEvent.click(screen.getByLabelText('Show available variables'))
    expect(screen.getByText('Available Variables')).toBeInTheDocument()

    // Click the overlay (the element with bg-black bg-opacity-50)
    const overlay = screen
      .getByText('Available Variables')
      .closest('.max-w-2xl')?.parentElement
    if (overlay) {
      fireEvent.click(overlay)
      expect(screen.queryByText('Available Variables')).not.toBeInTheDocument()
    }
  })

  it('should call onChange when typing', () => {
    const onChange = vi.fn()
    render(
      <TextInputWithVariableHelp
        value=""
        onChange={onChange}
        variables={mockVariables}
      />,
    )

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '$account' } })

    expect(onChange).toHaveBeenCalledWith('$account')
  })

  it('should display all variables with dollar prefix', () => {
    const onChange = vi.fn()
    render(
      <TextInputWithVariableHelp
        value=""
        onChange={onChange}
        variables={mockVariables}
      />,
    )

    fireEvent.click(screen.getByLabelText('Show available variables'))

    expect(screen.getByText('$account')).toBeInTheDocument()
    expect(screen.getByText('$date')).toBeInTheDocument()
  })

  it('should show empty state when no variables', () => {
    const onChange = vi.fn()
    render(
      <TextInputWithVariableHelp value="" onChange={onChange} variables={[]} />,
    )

    fireEvent.click(screen.getByLabelText('Show available variables'))
    expect(screen.getByText('No variables available')).toBeInTheDocument()
  })

  it('should render with label', () => {
    const onChange = vi.fn()
    render(
      <TextInputWithVariableHelp
        value=""
        onChange={onChange}
        variables={mockVariables}
        label="Output File"
        required
      />,
    )

    expect(screen.getByText('Output File')).toBeInTheDocument()
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('should respect disabled state', () => {
    const onChange = vi.fn()
    render(
      <TextInputWithVariableHelp
        value=""
        onChange={onChange}
        variables={mockVariables}
        disabled
      />,
    )

    const input = screen.getByRole('textbox')
    const helpButton = screen.getByLabelText('Show available variables')

    expect(input).toBeDisabled()
    expect(helpButton).toBeDisabled()
  })

  it('should accept all standard input props', () => {
    const onChange = vi.fn()
    render(
      <TextInputWithVariableHelp
        value=""
        onChange={onChange}
        variables={mockVariables}
        placeholder="Enter value"
        id="test-input"
        name="testField"
        required
        maxLength={100}
      />,
    )

    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('placeholder', 'Enter value')
    expect(input).toHaveAttribute('id', 'test-input')
    expect(input).toHaveAttribute('name', 'testField')
    expect(input).toHaveAttribute('required')
    expect(input).toHaveAttribute('maxlength', '100')
  })
})
