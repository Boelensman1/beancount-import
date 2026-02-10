'use client'

import { useRouter } from 'next/navigation'
import { RuleForm } from '../rule-form'
import type { Rule } from '@/lib/db/types'

interface RuleModalWrapperProps {
  accountId: string
  rule?: Rule // Optional - undefined for create
}

export function RuleModalWrapper({ accountId, rule }: RuleModalWrapperProps) {
  const router = useRouter()

  const handleClose = () => {
    router.push(`/rules/${accountId}`)
  }

  const handleSuccess = () => {
    router.push(`/rules/${accountId}`)
  }

  return (
    <RuleForm
      accountId={accountId}
      rule={rule}
      onClose={handleClose}
      onSuccess={handleSuccess}
    />
  )
}
