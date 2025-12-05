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
  })
})
