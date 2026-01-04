'use client'

import { forwardRef } from 'react'
import { INPUT_BASE_STYLES, ERROR_STYLES, cn } from './styles'
import type { BaseInputProps } from './types'

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>, BaseInputProps {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ error, className, id, ...props }, ref) {
    const errorId = id ? `${id}-error` : undefined

    return (
      <div>
        <textarea
          ref={ref}
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
