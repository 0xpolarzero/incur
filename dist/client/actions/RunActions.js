import { ClientError } from '../ClientError.js';
/** Executes a command through a client transport. */
export async function run(client, command, input) {
    const request = toRequest(client.defaults, command, input);
    const response = await client.transport.request(request);
    if ('stream' in response)
        return normalizeStream(client, request, response);
    return normalizeEnvelope(client, request, response);
}
/** Binds command run actions to a client. */
export function actions(client) {
    return {
        run(command, input) {
            return run(client, command, input);
        },
    };
}
function toRequest(defaults, command, input) {
    const merged = {
        ...defaults,
        ...input,
    };
    if (input && 'selection' in input && input.selection === undefined)
        delete merged.selection;
    return {
        command,
        args: isRecord(input?.args) ? input.args : {},
        options: isRecord(input?.options) ? input.options : {},
        ...(merged.outputFormat !== undefined ? { outputFormat: merged.outputFormat } : undefined),
        ...(merged.selection !== undefined ? { selection: merged.selection } : undefined),
        ...(merged.outputTokenCount !== undefined
            ? { outputTokenCount: merged.outputTokenCount }
            : undefined),
        ...(merged.outputTokenLimit !== undefined
            ? { outputTokenLimit: merged.outputTokenLimit }
            : undefined),
        ...(merged.outputTokenOffset !== undefined
            ? { outputTokenOffset: merged.outputTokenOffset }
            : undefined),
    };
}
function normalizeEnvelope(client, request, response) {
    if (!response.ok)
        throw errorFromEnvelope(client, response);
    return {
        ok: true,
        data: response.data,
        ...(response.output ? { output: output(client, request, response.output) } : undefined),
        meta: normalizeMeta(client, response.meta),
    };
}
function output(client, request, value) {
    return normalizeOutput(value, value.nextOffset, (nextOffset) => normalizeNext(client, {
        ...request,
        outputTokenOffset: nextOffset,
    }));
}
function normalizeOutput(value, nextOffset, next) {
    if (typeof value.text !== 'string')
        throw new ClientError('Malformed RPC output.');
    return {
        text: value.text,
        ...(value.format !== undefined ? { format: value.format } : undefined),
        ...(value.tokenCount !== undefined ? { tokenCount: value.tokenCount } : undefined),
        ...(value.tokenLimit !== undefined ? { tokenLimit: value.tokenLimit } : undefined),
        ...(value.tokenOffset !== undefined ? { tokenOffset: value.tokenOffset } : undefined),
        ...(nextOffset !== undefined && next ? { next: () => next(nextOffset) } : undefined),
    };
}
async function normalizeNext(client, request) {
    const response = await client.transport.request(request);
    if ('stream' in response)
        throw new ClientError('Expected non-streaming RPC response.');
    return normalizeEnvelope(client, request, response);
}
function normalizeStream(client, request, response) {
    let mode;
    let terminal;
    let resolveFinal;
    let rejectFinal;
    const iterator = response.records();
    const finalState = new Promise((resolve, reject) => {
        resolveFinal = resolve;
        rejectFinal = reject;
    });
    void finalState.catch(() => undefined);
    async function nextRecord() {
        const { value, done } = await iterator.next();
        if (done)
            throw new ClientError('RPC stream ended before a terminal record.');
        const record = streamRecord(value);
        if (record.type === 'done') {
            terminal = record;
            resolveFinal?.(record);
        }
        if (record.type === 'error') {
            const error = errorFromRecord(record);
            terminal = error;
            rejectFinal?.(error);
        }
        return record;
    }
    async function consumeFinal() {
        mode ??= 'final';
        if (mode !== 'final')
            throw new ClientError('Client stream has already been consumed.');
        if (terminal instanceof ClientError)
            throw terminal;
        if (terminal)
            return terminal;
        while (true) {
            const record = await nextRecord();
            if (record.type === 'done')
                return record;
            if (record.type === 'error')
                throw errorFromRecord(record);
        }
    }
    const final = finalState;
    const then = final.then.bind(final);
    const finalCatch = final.catch.bind(final);
    const finalFinally = final.finally.bind(final);
    // oxlint-disable-next-line unicorn/no-thenable -- `final` is an actual Promise; this starts lazy final-only consumption.
    final.then = ((onfulfilled, onrejected) => {
        if (mode === undefined)
            void consumeFinal().catch(() => undefined);
        return then(onfulfilled, onrejected);
    });
    final.catch = ((onrejected) => {
        if (mode === undefined)
            void consumeFinal().catch(() => undefined);
        return finalCatch(onrejected);
    });
    final.finally = ((onfinally) => {
        if (mode === undefined)
            void consumeFinal().catch(() => undefined);
        return finalFinally(onfinally);
    });
    const wrapper = {
        final,
        records() {
            if (mode === undefined)
                mode = 'records';
            else if (mode !== 'records')
                throw new ClientError('Client stream has already been consumed.');
            return recordsIterator();
        },
        [Symbol.asyncIterator]() {
            if (mode === undefined)
                mode = 'chunks';
            else if (mode !== 'chunks')
                throw new ClientError('Client stream has already been consumed.');
            return chunksIterator();
        },
    };
    async function* recordsIterator() {
        try {
            while (true) {
                const record = await nextRecord();
                yield record;
                if (record.type === 'done' || record.type === 'error')
                    return;
            }
        }
        finally {
            await iterator.return?.(undefined);
        }
    }
    async function* chunksIterator() {
        try {
            while (true) {
                const record = await nextRecord();
                if (record.type === 'chunk') {
                    yield record.data;
                    continue;
                }
                if (record.type === 'error')
                    throw errorFromRecord(record);
                return;
            }
        }
        finally {
            await iterator.return?.(undefined);
        }
    }
    function streamRecord(record) {
        if (record.type === 'chunk')
            return record;
        if (record.type === 'done')
            return {
                type: 'done',
                ok: true,
                ...('data' in record ? { data: record.data } : undefined),
                ...(record.output ? { output: normalizeOutput(record.output) } : undefined),
                meta: meta(record.meta),
            };
        return {
            type: 'error',
            ok: false,
            error: record.error,
            meta: meta(record.meta),
        };
    }
    function meta(value) {
        return normalizeMeta(client, value);
    }
    void request;
    return wrapper;
}
function errorFromEnvelope(client, response) {
    return new ClientError(response.error.message, {
        code: response.error.code,
        data: response,
        error: response.error,
        fieldErrors: response.error.fieldErrors,
        meta: normalizeMeta(client, response.meta),
        retryable: response.error.retryable,
        status: response.status,
    });
}
function errorFromRecord(record) {
    return new ClientError(record.error.message, {
        code: record.error.code,
        data: record,
        error: record.error,
        fieldErrors: record.error.fieldErrors,
        meta: record.meta,
        retryable: record.error.retryable,
    });
}
function normalizeMeta(client, value) {
    return {
        command: value.command,
        duration: value.duration,
        ...(value.cta ? { cta: ctaBlock(client, value.cta) } : undefined),
    };
}
function ctaBlock(client, value) {
    const block = isRecord(value) ? value : {};
    const commands = Array.isArray(block.commands) ? block.commands : [];
    return {
        ...(typeof block.description === 'string' ? { description: block.description } : undefined),
        commands: commands.flatMap((command) => {
            const suggestion = cta(client, command);
            return suggestion ? [suggestion] : [];
        }),
    };
}
function cta(client, value) {
    const raw = value;
    if (typeof value === 'string')
        return runnableCta(client, { command: value }, raw);
    if (isRecord(value) && typeof value.command === 'string')
        return runnableCta(client, value, raw);
    return undefined;
}
function runnableCta(client, value, raw) {
    const command = value.command;
    const args = isRecord(value.args) ? value.args : {};
    const options = isRecord(value.options) ? value.options : {};
    const result = {
        command,
        cliCommand: cliCommand(command, args, options),
        ...(typeof value.description === 'string' ? { description: value.description } : undefined),
        args,
        options,
        raw,
        run(optionsOverride) {
            if (!client)
                throw new ClientError('CTA is not attached to a client.');
            return run(client, command, { args, options, ...optionsOverride });
        },
    };
    return result;
}
function cliCommand(command, args, options) {
    const parts = [command];
    for (const [key, value] of Object.entries(args))
        parts.push(value === true ? `<${key}>` : String(value));
    for (const [key, value] of Object.entries(options)) {
        const flag = `--${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`;
        parts.push(flag, value === true ? `<${key}>` : String(value));
    }
    return parts.join(' ');
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=RunActions.js.map