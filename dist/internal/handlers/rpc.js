import { estimateTokenCount, sliceByTokens } from 'tokenx';
import { z } from 'zod';
import * as Filter from '../../Filter.js';
import * as Formatter from '../../Formatter.js';
import * as Command from '../command.js';
import * as RuntimeContext from '../runtime-context.js';
const requestSchema = z.object({
    command: z.string().transform((value) => value.trim().replace(/\s+/g, ' ')),
    args: z.record(z.string(), z.unknown()).optional(),
    options: z.record(z.string(), z.unknown()).optional(),
    outputFormat: z.enum(['toon', 'json', 'yaml', 'md', 'jsonl']).optional(),
    selection: z.array(z.string().min(1)).nonempty().optional(),
    outputTokenCount: z.boolean().optional(),
    outputTokenLimit: z.number().int().nonnegative().optional(),
    outputTokenOffset: z.number().int().nonnegative().optional(),
});
const sentinel = Symbol.for('incur.sentinel');
/** Returns the HTTP status for an RPC error code. */
export function getRpcStatus(code) {
    if (code === 'COMMAND_NOT_FOUND')
        return 404;
    if (code === 'VALIDATION_ERROR' || code === 'INVALID_RPC_REQUEST')
        return 400;
    if (code === 'COMMAND_GROUP' || code === 'FETCH_GATEWAY')
        return 400;
    return 500;
}
/** Creates the shared in-process RPC handler. */
export function createRpcHandler(ctx, options = {}) {
    return {
        async request(request) {
            const start = performance.now();
            const parsed = requestSchema.safeParse(request);
            if (!parsed.success)
                return errorEnvelope('', start, {
                    code: 'INVALID_RPC_REQUEST',
                    message: 'Invalid RPC request.',
                    fieldErrors: parsed.error.issues.map((issue) => ({
                        code: issue.code,
                        expected: 'valid RPC request',
                        received: 'invalid',
                        message: issue.message,
                        path: issue.path.join('.'),
                    })),
                });
            const rpc = parsed.data;
            if (!rpc.command)
                return errorEnvelope('', start, {
                    code: 'INVALID_RPC_REQUEST',
                    message: 'RPC command is required.',
                });
            const resolved = RuntimeContext.resolveCanonical(ctx, rpc.command);
            if ('error' in resolved)
                return errorEnvelope(rpc.command, start, {
                    code: resolved.error === 'empty' ? 'INVALID_RPC_REQUEST' : 'COMMAND_NOT_FOUND',
                    message: resolved.error === 'empty'
                        ? 'RPC command is required.'
                        : `'${resolved.token}' is not a command for '${resolved.parent}'.`,
                });
            if ('commands' in resolved)
                return errorEnvelope(rpc.command, start, {
                    code: 'COMMAND_GROUP',
                    message: `'${resolved.id}' is a command group. Specify a subcommand.`,
                });
            if ('gateway' in resolved)
                return errorEnvelope(rpc.command, start, {
                    code: 'FETCH_GATEWAY',
                    message: `'${resolved.id}' is a raw fetch gateway and cannot be called with structured RPC.`,
                });
            const result = await Command.execute(resolved.command, {
                agent: true,
                argv: [],
                env: ctx.env,
                envSource: options.env,
                format: rpc.outputFormat ?? Formatter.defaultFormat,
                formatExplicit: true,
                inputOptions: { args: rpc.args ?? {}, options: rpc.options ?? {} },
                middlewares: resolved.middlewares,
                name: ctx.name,
                parseMode: 'structured',
                path: resolved.id,
                vars: ctx.vars,
                version: ctx.version,
            });
            if ('stream' in result)
                return streamResponse(result.stream, resolved.id, start, rpc);
            if (!result.ok)
                return errorEnvelope(resolved.id, start, result.error, formatCta(ctx.name, result.cta));
            return successEnvelope(resolved.id, start, result.data, formatCta(ctx.name, result.cta), rpc);
        },
    };
}
function streamResponse(stream, command, start, request) {
    return {
        stream: true,
        async *records() {
            let terminal;
            try {
                while (true) {
                    const { value, done } = await stream.next();
                    if (done) {
                        if (isSentinel(value) && value[sentinel] === 'error') {
                            terminal = errorRecord(command, start, sentinelError(value), formatCta('', value.cta));
                        }
                        else {
                            const data = isSentinel(value) ? value.data : undefined;
                            terminal = {
                                type: 'done',
                                ...successEnvelope(command, start, data, formatCta('', isSentinel(value) ? value.cta : undefined), request),
                            };
                        }
                        yield terminal;
                        return terminal;
                    }
                    if (isSentinel(value) && value[sentinel] === 'error') {
                        terminal = errorRecord(command, start, sentinelError(value), formatCta('', value.cta));
                        yield terminal;
                        return terminal;
                    }
                    yield { type: 'chunk', data: value };
                }
            }
            catch (error) {
                terminal = errorRecord(command, start, {
                    code: 'UNKNOWN',
                    message: error instanceof Error ? error.message : String(error),
                }, undefined);
                yield terminal;
                return terminal;
            }
            finally {
                await stream.return(undefined).catch(() => undefined);
            }
        },
    };
}
function successEnvelope(command, start, data, cta, request = { command }) {
    const selected = applySelection(data, request.selection);
    const output = renderOutput(selected, request);
    const payload = outputPayload(output, request);
    return {
        ok: true,
        data: selected,
        ...(payload ? { output: payload } : undefined),
        meta: meta(command, start, cta),
    };
}
function errorEnvelope(command, start, error, cta) {
    return {
        ok: false,
        error,
        meta: meta(command, start, cta),
    };
}
function errorRecord(command, start, error, cta) {
    return { type: 'error', ...errorEnvelope(command, start, error, cta) };
}
function applySelection(data, selection) {
    if (!selection?.length)
        return data;
    return Filter.apply(data, selection.flatMap((value) => Filter.parse(value)));
}
function renderOutput(data, request) {
    const format = request.outputFormat ?? Formatter.defaultFormat;
    const text = Formatter.format(data, format);
    const count = estimateTokenCount(text);
    const offset = request.outputTokenOffset ?? 0;
    if (request.outputTokenLimit === undefined && request.outputTokenOffset === undefined)
        return { text, format, count, offset, truncated: false };
    const end = request.outputTokenLimit === undefined ? count : offset + request.outputTokenLimit;
    const sliced = sliceByTokens(text, offset, end);
    return {
        text: sliced,
        format,
        count,
        offset,
        truncated: offset > 0 || end < count,
        nextOffset: end < count ? end : undefined,
    };
}
function outputPayload(output, request) {
    if (!output.text && !includeTokenMetadata(request))
        return undefined;
    return {
        text: output.text,
        format: output.format,
        ...(output.nextOffset !== undefined ? { nextOffset: output.nextOffset } : undefined),
        ...(includeTokenMetadata(request) ? { tokenCount: output.count } : undefined),
        ...(request.outputTokenLimit !== undefined
            ? { tokenLimit: request.outputTokenLimit }
            : undefined),
        ...(request.outputTokenLimit !== undefined || request.outputTokenOffset !== undefined
            ? { tokenOffset: output.offset }
            : undefined),
        ...(output.truncated ? { truncated: true } : undefined),
    };
}
function includeTokenMetadata(request) {
    return (request.outputTokenCount ||
        request.outputTokenLimit !== undefined ||
        request.outputTokenOffset !== undefined);
}
function meta(command, start, cta) {
    return {
        command,
        duration: `${Math.round(performance.now() - start)}ms`,
        ...(cta ? { cta } : undefined),
    };
}
function formatCta(name, block) {
    if (!block || typeof block !== 'object' || !('commands' in block))
        return undefined;
    const commands = block.commands;
    if (commands.length === 0)
        return undefined;
    return {
        description: block.description ??
            (commands.length === 1 ? 'Suggested command:' : 'Suggested commands:'),
        commands: commands.map((command) => {
            if (typeof command === 'string')
                return { command: name ? `${name} ${command}` : command };
            if (typeof command === 'object' && command !== null && 'command' in command)
                return command;
            return { command: String(command) };
        }),
    };
}
function isSentinel(value) {
    return typeof value === 'object' && value !== null && sentinel in value;
}
function sentinelError(value) {
    return {
        code: value.code ?? 'UNKNOWN',
        message: value.message ?? 'Command failed',
        ...(value.retryable !== undefined ? { retryable: value.retryable } : undefined),
    };
}
//# sourceMappingURL=rpc.js.map