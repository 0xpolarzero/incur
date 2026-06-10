import * as Cli from '../Cli.js';
import * as Schema from '../Schema.js';
/** Returns a runtime context for a CLI instance. */
export function fromCli(cli) {
    const commands = Cli.toCommands.get(cli);
    if (!commands)
        throw new Error('No commands registered on this CLI instance');
    const version = Cli.toVersion.get(cli);
    return {
        commands: commands,
        ...(cli.description ? { description: cli.description } : undefined),
        ...(cli.env ? { env: cli.env } : undefined),
        middlewares: Cli.toMiddlewares.get(cli) ?? [],
        ...(Cli.toMcpOptions.get(cli) ? { mcp: Cli.toMcpOptions.get(cli) } : undefined),
        name: cli.name,
        ...(Cli.toRootDefinition.get(cli)
            ? {
                rootCommand: Cli.toRootDefinition.get(cli),
            }
            : undefined),
        ...(Cli.toSyncOptions.get(cli) ? { sync: Cli.toSyncOptions.get(cli) } : undefined),
        ...(cli.vars ? { vars: cli.vars } : undefined),
        ...(version !== undefined ? { version } : undefined),
    };
}
/** Returns true when an entry is an alias. */
export function isAlias(entry) {
    return Cli.isAlias(entry);
}
/** Returns true when an entry is a command group. */
export function isGroup(entry) {
    return Cli.isGroup(entry);
}
/** Returns true when an entry is a raw fetch gateway. */
export function isFetchGateway(entry) {
    return Cli.isFetchGateway(entry);
}
/** Resolves an alias entry within its owning command map. */
export function resolveAlias(commands, entry) {
    return Cli.resolveAlias(commands, entry);
}
/** Resolves a canonical command ID without accepting aliases. */
export function resolveCanonical(ctx, command) {
    const id = command.trim().replace(/\s+/g, ' ');
    if (!id)
        return { error: 'empty', parent: ctx.name };
    if (ctx.rootCommand && id === ctx.name)
        return { id, command: ctx.rootCommand, middlewares: ctx.middlewares ?? [] };
    let commands = ctx.commands;
    let entry;
    let parent = ctx.name;
    const path = [];
    const middlewares = [...(ctx.middlewares ?? [])];
    for (const token of id.split(' ')) {
        entry = commands.get(token);
        if (!entry || isAlias(entry))
            return { error: 'unknown', token, parent };
        path.push(token);
        if (isGroup(entry)) {
            middlewares.push(...(entry.middlewares ?? []));
            commands = entry.commands;
            parent = path.join(' ');
            continue;
        }
        if (path.join(' ') !== id)
            return { error: 'unknown', token: id.split(' ')[path.length], parent };
    }
    if (!entry)
        return { error: 'unknown', token: id, parent };
    if (isGroup(entry))
        return { id, commands: entry.commands, description: entry.description };
    if (isFetchGateway(entry))
        return { id, gateway: entry, middlewares };
    if (isAlias(entry))
        return { error: 'unknown', token: id, parent };
    return { id, command: entry, middlewares: [...middlewares, ...(entry.middleware ?? [])] };
}
/** Traverses structured command entries. Aliases and raw fetch gateways are excluded. */
export function collectStructuredCommands(ctx) {
    const result = [];
    if (ctx.rootCommand)
        result.push({ id: ctx.name, command: ctx.rootCommand, middlewares: ctx.middlewares ?? [] });
    collect(ctx.commands, [], ctx.middlewares ?? [], result);
    return result.sort((a, b) => a.id.localeCompare(b.id));
}
function collect(commands, prefix, middlewares, result) {
    for (const [name, entry] of commands) {
        if (isAlias(entry) || isFetchGateway(entry))
            continue;
        const path = [...prefix, name];
        if (isGroup(entry)) {
            collect(entry.commands, path, [...middlewares, ...(entry.middlewares ?? [])], result);
            continue;
        }
        result.push({
            id: path.join(' '),
            command: entry,
            middlewares: [...middlewares, ...(entry.middleware ?? [])],
        });
    }
}
/** Builds the structured input schema used by discovery payloads. */
export function buildInputSchema(command) {
    if (!command.args && !command.env && !command.options)
        return undefined;
    const result = {};
    if (command.args)
        result.args = Schema.toJsonSchema(command.args);
    if (command.env)
        result.env = Schema.toJsonSchema(command.env);
    if (command.options)
        result.options = Schema.toJsonSchema(command.options);
    return result;
}
//# sourceMappingURL=runtime-context.js.map