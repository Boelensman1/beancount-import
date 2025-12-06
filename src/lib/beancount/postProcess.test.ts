import { describe, it, expect } from 'vitest'
import { executePostProcessCommand } from './postProcess'

describe('postProcess', () => {
  describe('executePostProcessCommand', () => {
    it('should execute command successfully with variable substitution', async () => {
      const command = 'echo "File: $outputFile, Account: $account"'
      const filePath = '/path/to/file.beancount'
      const accountName = 'Assets:Checking'

      const result = await executePostProcessCommand(
        command,
        filePath,
        accountName,
      )

      expect(result.success).toBe(true)
      expect(result.output).toContain('/path/to/file.beancount')
      expect(result.output).toContain('Assets:Checking')
    })

    it('should handle command with simple arguments', async () => {
      const command = 'echo hello world'
      const result = await executePostProcessCommand(
        command,
        '/file',
        'account',
      )

      expect(result.success).toBe(true)
      expect(result.output).toContain('hello')
      expect(result.output).toContain('world')
    })

    it('should handle command with quoted arguments', async () => {
      const command = 'echo "hello world"'
      const result = await executePostProcessCommand(
        command,
        '/file',
        'account',
      )

      expect(result.success).toBe(true)
      expect(result.output).toContain('hello world')
    })

    it('should return error for non-existent command', async () => {
      const command = 'nonexistent-command-xyz123'
      const result = await executePostProcessCommand(
        command,
        '/file',
        'account',
      )

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('exited with code 127')
    })

    it('should return error for command that fails', async () => {
      const command = 'sh -c "exit 1"'
      const result = await executePostProcessCommand(
        command,
        '/file',
        'account',
      )

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('exited with code 1')
    })

    it('should capture stdout and stderr', async () => {
      const command = 'sh -c "echo stdout; echo stderr >&2"'
      const result = await executePostProcessCommand(
        command,
        '/file',
        'account',
      )

      expect(result.success).toBe(true)
      expect(result.output).toContain('stdout')
      expect(result.output).toContain('stderr')
    })

    it('should return error for undefined variables', async () => {
      const command = 'echo $undefinedVar'
      const result = await executePostProcessCommand(
        command,
        '/file',
        'account',
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Variable substitution failed')
    })

    it('should handle timeout for long-running commands', async () => {
      // timeout is shorter in test env
      const command = 'sleep 100'
      const result = await executePostProcessCommand(
        command,
        '/file',
        'account',
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('timed out')
    }, 10000)

    it('should support additional variables in command substitution', async () => {
      const command =
        'echo "CSV: $csvPath, From: $importedFrom, To: $importedTo"'
      const result = await executePostProcessCommand(
        command,
        '/path/to/file.csv',
        'Assets:Checking',
        {
          csvPath: '/path/to/file.csv',
          importedFrom: '2024-01-01',
          importedTo: '2024-01-31',
        },
      )

      expect(result.success).toBe(true)
      expect(result.output).toContain('/path/to/file.csv')
      expect(result.output).toContain('2024-01-01')
      expect(result.output).toContain('2024-01-31')
    })

    it('should maintain backward compatibility without additionalVariables', async () => {
      const command = 'echo "File: $outputFile, Account: $account"'
      const result = await executePostProcessCommand(
        command,
        '/path/to/file.beancount',
        'Assets:Checking',
      )

      expect(result.success).toBe(true)
      expect(result.output).toContain('/path/to/file.beancount')
      expect(result.output).toContain('Assets:Checking')
    })

    it('should merge additional variables with base variables', async () => {
      const command =
        'echo "Account: $account, Output: $outputFile, CSV: $csvPath"'
      const result = await executePostProcessCommand(
        command,
        '/path/to/output.beancount',
        'Assets:Checking',
        {
          csvPath: '/path/to/input.csv',
        },
      )

      expect(result.success).toBe(true)
      expect(result.output).toContain('Assets:Checking')
      expect(result.output).toContain('/path/to/output.beancount')
      expect(result.output).toContain('/path/to/input.csv')
    })

    it('should return error for undefined additional variables', async () => {
      const command = 'echo $undefinedAdditionalVar'
      const result = await executePostProcessCommand(
        command,
        '/file',
        'account',
        {
          csvPath: '/path/to/file.csv',
        },
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Variable substitution failed')
    })

    it('should allow empty string values in additional variables', async () => {
      const command =
        'echo "From: $importedFrom, To: $importedTo, Account: $account"'
      const result = await executePostProcessCommand(
        command,
        '/file',
        'Assets:Checking',
        {
          importedFrom: '',
          importedTo: '',
        },
      )

      expect(result.success).toBe(true)
      expect(result.output).toContain('Assets:Checking')
      expect(result.output).toContain('From: , To: ,')
    })
  })
})
