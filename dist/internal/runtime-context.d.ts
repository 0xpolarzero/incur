import type { z } from 'zod';
import * as Cli from '../Cli.js';
import type { CommandDefinition, CommandEntry, InternalAlias, InternalFetchGateway, InternalGroup } from '../Cli.js';
import type { Handler as MiddlewareHandler } from '../middleware.js';
/** Runtime metadata needed to execute and discover a CLI command tree. */
export type RuntimeCliContext = {
    /** Command map registered on the CLI. */
    commands: Map<string, CommandEntry>;
    /** CLI description. */
    description?: string | undefined;
    /** CLI-level env schema. */
    env?: z.ZodObject<any> | undefined;
    /** Middleware handlers registered on the root CLI. */
    middlewares?: MiddlewareHandler[] | undefined;
    /** Local MCP setup defaults. */
    mcp?: {
        agents?: string[] | undefined;
        command?: string | undefined;
    } | undefined;
    /** CLI name. */
    name: string;
    /** Root command definition, when the CLI itself is callable. */
    rootCommand?: CommandDefinition<any, any, any, any, any, any> | undefined;
    /** Local skill sync defaults. */
    sync?: {
        cwd?: string | undefined;
        depth?: number | undefined;
        include?: string[] | undefined;
        suggestions?: string[] | undefined;
    } | undefined;
    /** Vars schema for middleware variables. */
    vars?: z.ZodObject<any> | undefined;
    /** CLI version string. */
    version?: string | undefined;
};
/** Resolved callable command. */
export type ResolvedCommand = {
    command: CommandDefinition<any, any, any, any, any, any>;
    id: string;
    middlewares: MiddlewareHandler[];
};
/** Resolved command group. */
export type ResolvedGroup = {
    commands: Map<string, CommandEntry>;
    description?: string | undefined;
    id: string;
};
/** Resolved raw fetch gateway. */
export type ResolvedFetchGateway = {
    gateway: InternalFetchGateway;
    id: string;
    middlewares: MiddlewareHandler[];
};
/** Returns a runtime context for a CLI instance. */
export declare function fromCli(cli: Cli.Cli<any, any, any>): RuntimeCliContext;
/** Returns true when an entry is an alias. */
export declare function isAlias(entry: CommandEntry): entry is InternalAlias;
/** Returns true when an entry is a command group. */
export declare function isGroup(entry: CommandEntry): entry is InternalGroup;
/** Returns true when an entry is a raw fetch gateway. */
export declare function isFetchGateway(entry: CommandEntry): entry is InternalFetchGateway;
/** Resolves an alias entry within its owning command map. */
export declare function resolveAlias(commands: Map<string, CommandEntry>, entry: CommandEntry): Exclude<CommandEntry, InternalAlias>;
/** Resolves a canonical command ID without accepting aliases. */
export declare function resolveCanonical(ctx: RuntimeCliContext, command: string): ResolvedCommand | ResolvedGroup | ResolvedFetchGateway | {
    error: 'empty' | 'unknown';
    token?: string | undefined;
    parent: string;
};
/** Traverses structured command entries. Aliases and raw fetch gateways are excluded. */
export declare function collectStructuredCommands(ctx: RuntimeCliContext): ResolvedCommand[];
/** Builds the structured input schema used by discovery payloads. */
export declare function buildInputSchema(command: CommandDefinition<any, any, any, any, any, any>): {
    args?: Record<string, unknown> | undefined;
    env?: Record<string, unknown> | undefined;
    options?: Record<string, unknown> | undefined;
} | undefined;
//# sourceMappingURL=runtime-context.d.ts.map