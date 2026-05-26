import fs from 'node:fs/promises'
import { z } from 'zod'

import * as Cli from './Cli.js'
import * as RuntimeContext from './internal/runtime-context.js'
import { importCli } from './internal/utils.js'

/** Imports a CLI from `input` (must `export default` a `Cli`), generates the `.d.ts`, and writes it to `output`. */
export async function generate(input: string, output: string): Promise<void> {
  const cli = await importCli(input)
  await fs.writeFile(output, fromCli(cli))
}

/** Generates a `.d.ts` declaration string for the `incur` module augmentation. */
export function fromCli(cli: Cli.Cli): string {
  const entries = RuntimeContext.collectStructuredCommands(RuntimeContext.fromCli(cli))

  const lines: string[] = ['export type Commands = {']

  for (const { id, command } of entries)
    lines.push(
      `  ${propertyKey(id)}: { args: ${objectSchemaToType(command.args)}; options: ${objectSchemaToType(command.options)}${command.output ? `; output: ${schemaToType(command.output)}` : ''}${isStream(command) ? '; stream: true' : ''} }`,
    )

  lines.push(
    '}',
    '',
    "declare module 'incur' {",
    '  interface Register {',
    '    commands: Commands',
    '  }',
    '}',
    '',
    "declare module 'incur/client' {",
    '  interface Register {',
    '    commands: Commands',
    '  }',
    '}',
    '',
  )
  return lines.join('\n')
}

/** Converts a Zod object schema to a TypeScript type string. Returns `{}` for undefined schemas. */
function objectSchemaToType(schema: z.ZodObject<any> | undefined): string {
  if (!schema) return '{}'
  return schemaToType(schema)
}

/** Converts a Zod schema to a TypeScript type string. */
function schemaToType(schema: z.ZodType): string {
  const json = z.toJSONSchema(schema) as Record<string, unknown>
  const defs = (json.$defs ?? {}) as Record<string, Record<string, unknown>>
  return resolveType(json, defs)
}

/** Recursively resolves a JSON Schema node to a TypeScript type string. */
function resolveType(
  schema: Record<string, unknown>,
  defs: Record<string, Record<string, unknown>>,
): string {
  if (schema.$ref) {
    const ref = (schema.$ref as string).replace('#/$defs/', '')
    const resolved = defs[ref]
    if (resolved) return resolveType(resolved, defs)
    return 'unknown'
  }

  if ('const' in schema) return JSON.stringify(schema.const)
  if (schema.enum) return (schema.enum as unknown[]).map((v) => JSON.stringify(v)).join(' | ')
  if (schema.anyOf)
    return (schema.anyOf as Record<string, unknown>[]).map((s) => resolveType(s, defs)).join(' | ')

  const type = schema.type as string | string[] | undefined
  if (Array.isArray(type))
    return type
      .map((t) => (t === 'null' ? 'null' : resolveType({ ...schema, type: t }, defs)))
      .join(' | ')

  switch (type) {
    case 'string':
      return 'string'
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'null':
      return 'null'
    case 'array': {
      const prefixItems = schema.prefixItems as Record<string, unknown>[] | undefined
      if (prefixItems) {
        const items = prefixItems.map((item) => resolveType(item, defs))
        const rest = schema.items as Record<string, unknown> | undefined
        if (rest) items.push(`...${arrayToType(resolveType(rest, defs))}`)
        return `[${items.join(', ')}]`
      }

      const items = schema.items as Record<string, unknown> | undefined
      const itemType = items ? resolveType(items, defs) : 'unknown'
      return arrayToType(itemType)
    }
    case 'object':
      return objectToType(schema, defs)
    default:
      return 'unknown'
  }
}

function arrayToType(type: string): string {
  return type.includes(' | ') || type.includes(' & ') ? `(${type})[]` : `${type}[]`
}

function objectToType(
  schema: Record<string, unknown>,
  defs: Record<string, Record<string, unknown>>,
): string {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined
  const required = new Set((schema.required as unknown[] | undefined) ?? [])
  const entries = Object.entries(properties ?? {}).map(([key, value]) =>
    propertyToType(key, value, required, defs),
  )
  const object = entries.length > 0 ? `{ ${entries.join('; ')} }` : '{}'
  const additional = schema.additionalProperties as Record<string, unknown> | boolean | undefined

  if (!additional) return object
  const value = typeof additional === 'object' ? resolveType(additional, defs) : 'unknown'
  const propertyNames = schema.propertyNames as Record<string, unknown> | undefined
  const key = recordKeyToType(propertyNames, defs)
  const propertyValues = Object.entries(properties ?? {}).map(([key, value]) =>
    propertyValueToType(key, value, required, defs),
  )
  const recordValue = unionTypes([value, ...propertyValues])
  const record = recordToType(key, recordValue, propertyNames, required)
  if (entries.length === 0) return record
  return `${object} & ${record}`
}

function recordKeyToType(
  schema: Record<string, unknown> | undefined,
  defs: Record<string, Record<string, unknown>>,
): string {
  if (!schema) return 'string'
  const type = resolveType(schema, defs)
  if (type === 'unknown') return 'string'
  return type
}

function recordToType(
  key: string,
  value: string,
  propertyNames: Record<string, unknown> | undefined,
  required: Set<unknown>,
): string {
  const record = `Record<${key}, ${value}>`
  const keys = propertyNames ? finitePropertyNames(propertyNames) : undefined
  if (!keys) return record

  if (keys.every((key) => required.has(key))) return record
  return `Partial<${record}>`
}

function finitePropertyNames(schema: Record<string, unknown>): unknown[] | undefined {
  if ('const' in schema) return [schema.const]
  if (schema.enum) return schema.enum as unknown[]
  if (schema.anyOf) {
    const keys = (schema.anyOf as Record<string, unknown>[]).map(finitePropertyNames)
    if (keys.every((key) => key)) return keys.flatMap((key) => key)
  }
  return undefined
}

function propertyValueToType(
  key: string,
  schema: Record<string, unknown>,
  required: Set<unknown>,
  defs: Record<string, Record<string, unknown>>,
): string {
  const type = resolveType(schema, defs)
  if (required.has(key)) return type
  return unionTypes([type, 'undefined'])
}

function unionTypes(types: string[]): string {
  const entries = types.flatMap(splitUnionType)
  if (entries.includes('unknown')) return 'unknown'
  return [...new Set(entries)].join(' | ')
}

function splitUnionType(type: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote = ''
  let start = 0

  for (let i = 0; i < type.length; i++) {
    const char = type[i]
    if (quote) {
      if (char === '\\') i++
      else if (char === quote) quote = ''
    } else if (char === '"' || char === "'") quote = char
    else if (char === '(' || char === '[' || char === '{' || char === '<') depth++
    else if (char === ')' || char === ']' || char === '}' || char === '>') depth--
    else if (depth === 0 && type.slice(i, i + 3) === ' | ') {
      parts.push(type.slice(start, i))
      start = i + 3
      i += 2
    }
  }

  parts.push(type.slice(start))
  return parts
}

function propertyToType(
  key: string,
  schema: Record<string, unknown>,
  required: Set<unknown>,
  defs: Record<string, Record<string, unknown>>,
): string {
  const type = resolveType(schema, defs)
  if (required.has(key)) return `${propertyKey(key)}: ${type}`
  return `${propertyKey(key)}?: ${type} | undefined`
}

function propertyKey(key: string): string {
  if (/^[$A-Z_a-z][$\w]*$/.test(key)) return key
  return JSON.stringify(key)
}

function isStream(command: Cli.CommandDefinition<any, any, any, any, any, any>) {
  return command.run.constructor.name === 'AsyncGeneratorFunction'
}
