'use client'

import { forwardRef } from 'react'
import {
  CHECKBOX_STYLES,
  CHECKBOX_WRAPPER_STYLES,
  ERROR_STYLES,
  cn,
} from './styles'
import type { BaseInputProps } from './types'

export interface CheckboxProps
  extends
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>,
    BaseInputProps {
  /** Label text to display next to the checkbox (use this OR children) */
  label?: string
  /** Optional description text below the label */
  description?: string
  /** Custom content to render instead of label (for complex layouts) */
  children?: React.ReactNode
  /** Custom classes for the wrapper label element */
  wrapperClassName?: string
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    {
      label,
      description,
      error,
      className,
      id,
      children,
      wrapperClassName,
      ...props
    },
    ref,
  ) {
    const errorId = id ? `${id}-error` : undefined

    return (
      <div>
        <label className={cn(CHECKBOX_WRAPPER_STYLES, wrapperClassName)}>
          <input
            ref={ref}
            type="checkbox"
            id={id}
            className={cn(
              CHECKBOX_STYLES,
              error && ERROR_STYLES.input,
              className,
            )}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error && errorId ? errorId : undefined}
            {...props}
          />
          {children ?? <span className="text-sm font-medium">{label}</span>}
        </label>
        {description && (
          <p className="mt-1 ml-6 text-xs text-gray-500">{description}</p>
        )}
        {error && (
          <p
            id={errorId}
            className={cn(ERROR_STYLES.message, 'ml-6')}
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    )
  },
)
