import type { z } from 'zod'

import * as Cli from '../Cli.js'
import type { Handler as MiddlewareHandler } from '../middleware.js'
import * as Schema from '../Schema.js'

/** Runtime metadata needed to execute and discover a CLI command tree. */
export type RuntimeCliContext = {
  /** Command map registered on the CLI. */
  commands: Map<string, CommandEntry>
  /** CLI description. */
  description?: string | undefined
  /** CLI-level env schema. */
  env?: z.ZodObject<any> | undefined
  /** Middleware handlers registered on the root CLI. */
  middlewares?: MiddlewareHandler[] | undefined
  /** Local MCP setup defaults. */
  mcp?: { agents?: string[] | undefined; command?: string | undefined } | undefined
  /** CLI name. */
  name: string
  /** Root command definition, when the CLI itself is callable. */
  rootCommand?: CommandDefinition | undefined
  /** Local skill sync defaults. */
  sync?:
    | {
        cwd?: string | undefined
        depth?: number | undefined
        include?: string[] | undefined
        suggestions?: string[] | undefined
      }
    | undefined
  /** Vars schema for middleware variables. */
  vars?: z.ZodObject<any> | undefined
  /** CLI version string. */
  version?: string | undefined
}

/** Internal command entry shape shared by CLI consumers. */
export type CommandEntry = CommandDefinition | CommandGroup | FetchGateway | CommandAlias

/** Internal command definition shape. */
export type CommandDefinition = {
  alias?: Record<string, string> | undefined
  args?: z.ZodObject<any> | undefined
  description?: string | undefined
  env?: z.ZodObject<any> | undefined
  examples?: unknown[] | undefined
  hint?: string | undefined
  middleware?: MiddlewareHandler[] | undefined
  options?: z.ZodObject<any> | undefined
  output?: z.ZodType | undefined
  outputPolicy?: Cli.OutputPolicy | undefined
  run: Function
  usage?: unknown[] | undefined
}

/** Internal command group shape. */
export type CommandGroup = {
  _group: true
  commands: Map<string, CommandEntry>
  description?: string | undefined
  middlewares?: MiddlewareHandler[] | undefined
  outputPolicy?: Cli.OutputPolicy | undefined
}

/** Internal raw fetch gateway shape. */
export type FetchGateway = {
  _fetch: true
  basePath?: string | undefined
  description?: string | undefined
  fetch: (req: Request) => Response | Promise<Response>
  outputPolicy?: Cli.OutputPolicy | undefined
}

/** Internal alias entry shape. */
export type CommandAlias = {
  _alias: true
  target: string
}

/** Resolved callable command. */
export type ResolvedCommand = {
  command: CommandDefinition
  id: string
  middlewares: MiddlewareHandler[]
}

/** Resolved command group. */
export type ResolvedGroup = {
  commands: Map<string, CommandEntry>
  description?: string | undefined
  id: string
}

/** Resolved raw fetch gateway. */
export type ResolvedFetchGateway = {
  gateway: FetchGateway
  id: string
  middlewares: MiddlewareHandler[]
}

/** Returns a runtime context for a CLI instance. */
export function fromCli(cli: Cli.Cli<any, any, any>): RuntimeCliContext {
  const commands = Cli.toCommands.get(cli)
  if (!commands) throw new Error('No commands registered on this CLI instance')
  return {
    commands: commands as Map<string, CommandEntry>,
    ...(cli.description ? { description: cli.description } : undefined),
    ...(cli.env ? { env: cli.env } : undefined),
    middlewares: Cli.toMiddlewares.get(cli) ?? [],
    ...(Cli.toMcpOptions.get(cli) ? { mcp: Cli.toMcpOptions.get(cli) } : undefined),
    name: cli.name,
    ...(Cli.toRootDefinition.get(cli as unknown as Cli.Root)
      ? { rootCommand: Cli.toRootDefinition.get(cli as unknown as Cli.Root) as CommandDefinition }
      : undefined),
    ...(Cli.toSyncOptions.get(cli) ? { sync: Cli.toSyncOptions.get(cli) } : undefined),
    ...(cli.vars ? { vars: cli.vars } : undefined),
  }
}

/** Returns true when an entry is an alias. */
export function isAlias(entry: CommandEntry): entry is CommandAlias {
  return '_alias' in entry
}

/** Returns true when an entry is a command group. */
export function isGroup(entry: CommandEntry): entry is CommandGroup {
  return '_group' in entry
}

/** Returns true when an entry is a raw fetch gateway. */
export function isFetchGateway(entry: CommandEntry): entry is FetchGateway {
  return '_fetch' in entry
}

/** Resolves an alias entry within its owning command map. */
export function resolveAlias(
  commands: Map<string, CommandEntry>,
  entry: CommandEntry,
): Exclude<CommandEntry, CommandAlias> {
  if (!isAlias(entry)) return entry
  return commands.get(entry.target)! as Exclude<CommandEntry, CommandAlias>
}

/** Resolves a canonical command ID without accepting aliases. */
export function resolveCanonical(
  ctx: RuntimeCliContext,
  command: string,
):
  | ResolvedCommand
  | ResolvedGroup
  | ResolvedFetchGateway
  | { error: 'empty' | 'unknown'; token?: string | undefined; parent: string } {
  const id = command.trim().replace(/\s+/g, ' ')
  if (!id) return { error: 'empty', parent: ctx.name }
  if (ctx.rootCommand && id === ctx.name)
    return { id, command: ctx.rootCommand, middlewares: ctx.middlewares ?? [] }

  let commands = ctx.commands
  let entry: CommandEntry | undefined
  let parent = ctx.name
  const path: string[] = []
  const middlewares = [...(ctx.middlewares ?? [])]

  for (const token of id.split(' ')) {
    entry = commands.get(token)
    if (!entry || isAlias(entry)) return { error: 'unknown', token, parent }
    path.push(token)
    if (isGroup(entry)) {
      middlewares.push(...(entry.middlewares ?? []))
      commands = entry.commands
      parent = path.join(' ')
      continue
    }
    if (path.join(' ') !== id)
      return { error: 'unknown', token: id.split(' ')[path.length], parent }
  }

  if (!entry) return { error: 'unknown', token: id, parent }
  if (isGroup(entry)) return { id, commands: entry.commands, description: entry.description }
  if (isFetchGateway(entry)) return { id, gateway: entry, middlewares }
  if (isAlias(entry)) return { error: 'unknown', token: id, parent }
  return { id, command: entry, middlewares: [...middlewares, ...(entry.middleware ?? [])] }
}

/** Traverses callable client command entries. Aliases and raw fetch gateways are excluded. */
export function collectClientCommands(ctx: RuntimeCliContext): ResolvedCommand[] {
  const result: ResolvedCommand[] = []
  if (ctx.rootCommand)
    result.push({ id: ctx.name, command: ctx.rootCommand, middlewares: ctx.middlewares ?? [] })
  collect(ctx.commands, [], ctx.middlewares ?? [], result)
  return result.sort((a, b) => a.id.localeCompare(b.id))
}

function collect(
  commands: Map<string, CommandEntry>,
  prefix: string[],
  middlewares: MiddlewareHandler[],
  result: ResolvedCommand[],
) {
  for (const [name, entry] of commands) {
    if (isAlias(entry) || isFetchGateway(entry)) continue
    const path = [...prefix, name]
    if (isGroup(entry)) {
      collect(entry.commands, path, [...middlewares, ...(entry.middlewares ?? [])], result)
      continue
    }
    result.push({
      id: path.join(' '),
      command: entry,
      middlewares: [...middlewares, ...(entry.middleware ?? [])],
    })
  }
}

/** Builds the structured input schema used by discovery payloads. */
export function buildInputSchema(command: CommandDefinition):
  | {
      args?: Record<string, unknown> | undefined
      env?: Record<string, unknown> | undefined
      options?: Record<string, unknown> | undefined
    }
  | undefined {
  if (!command.args && !command.env && !command.options) return undefined
  const result: {
    args?: Record<string, unknown> | undefined
    env?: Record<string, unknown> | undefined
    options?: Record<string, unknown> | undefined
  } = {}
  if (command.args) result.args = Schema.toJsonSchema(command.args)
  if (command.env) result.env = Schema.toJsonSchema(command.env)
  if (command.options) result.options = Schema.toJsonSchema(command.options)
  return result
}
