'use client'

import { forwardRef } from 'react'
import { INPUT_BASE_STYLES, ERROR_STYLES, cn } from './styles'
import type { BaseInputProps } from './types'

export interface DateInputProps
  extends
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>,
    BaseInputProps {}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  function DateInput({ error, className, id, ...props }, ref) {
    const errorId = id ? `${id}-error` : undefined

    return (
      <div>
        <input
          ref={ref}
          type="date"
          id={id}
          className={cn(
            INPUT_BASE_STYLES,
            error && ERROR_STYLES.input,
            className,
          )}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error && errorId ? errorId : undefined}
          {...props}
        />
        {error && (
          <p id={errorId} className={ERROR_STYLES.message} role="alert">
            {error}
          </p>
        )}
      </div>
    )
  },
)
