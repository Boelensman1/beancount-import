'use client'

import { forwardRef } from 'react'
import { SELECT_BASE_STYLES, ERROR_STYLES, cn } from './styles'
import type { BaseInputProps } from './types'

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement>, BaseInputProps {
  children: React.ReactNode
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ error, className, id, children, ...props }, ref) {
    const errorId = id ? `${id}-error` : undefined

    return (
      <div>
        <select
          ref={ref}
          id={id}
          className={cn(
            SELECT_BASE_STYLES,
            error && ERROR_STYLES.input,
            className,
          )}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error && errorId ? errorId : undefined}
          {...props}
        >
          {children}
        </select>
        {error && (
          <p id={errorId} className={ERROR_STYLES.message} role="alert">
            {error}
          </p>
        )}
      </div>
    )
  },
)
