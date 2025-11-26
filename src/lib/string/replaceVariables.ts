/**
 * Replaces variables in a string with their corresponding values.
 * Variables in the input string are denoted with a $ prefix (e.g., $account).
 * The variables object keys should NOT include the $ prefix.
 *
 * @param input - The string containing variables to replace
 * @param variables - Object mapping variable names to values
 * @returns The string with all variables replaced
 * @throws Error if any variable in the input string is not provided in variables object
 *
 * @example
 * replaceVariables("import $account", {account: "Income:Rent"})
 * // Returns: "import Income:Rent"
 */
export function replaceVariables(
  input: string,
  variables: Record<string, string>,
): string {
  // Find all variables in the input string
  // Variable names must start with a letter (to avoid matching things like $50)
  const variablePattern = /\$([a-zA-Z]\w*)\b/g
  const foundVariables = new Set<string>()
  let match

  while ((match = variablePattern.exec(input)) !== null) {
    foundVariables.add(match[1])
  }

  // Check for undefined variables
  for (const varName of foundVariables) {
    if (!(varName in variables)) {
      throw new Error(`Variable '$${varName}' is not defined`)
    }
  }

  // Replace all variables
  let result = input
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\$${escapeRegex(key)}\\b`, 'g')
    result = result.replace(regex, value)
  }

  return result
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
