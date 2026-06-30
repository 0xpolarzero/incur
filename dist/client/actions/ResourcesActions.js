import { ClientError } from '../ClientError.js';
/** Reads compact LLM resources. */
export async function llms(client, options = {}) {
    const { command, format = 'json' } = options;
    return discover(client, {
        resource: 'llms',
        ...(command ? { command } : undefined),
        format,
    });
}
/** Reads full LLM resources. */
export async function llmsFull(client, options = {}) {
    const { command, format = 'json' } = options;
    return discover(client, {
        resource: 'llmsFull',
        ...(command ? { command } : undefined),
        format,
    });
}
/** Reads a command schema. */
export async function schema(client, command) {
    return discover(client, {
        resource: 'schema',
        ...(command ? { command } : undefined),
    });
}
/** Reads help text. */
export async function help(client, command) {
    return discover(client, {
        resource: 'help',
        ...(command ? { command } : undefined),
    });
}
/** Reads the OpenAPI document. */
export async function openapi(client) {
    return discover(client, { resource: 'openapi' });
}
/** Reads the generated skills index. */
export async function skillsIndex(client) {
    return discover(client, { resource: 'skillsIndex' });
}
/** Reads a generated skill file. */
export async function skill(client, name) {
    return discover(client, { resource: 'skill', name });
}
/** Reads MCP tool descriptors. */
export async function mcpTools(client) {
    return discover(client, { resource: 'mcpTools' });
}
/** Binds resource actions to a client. */
export function actions(client) {
    return {
        llms(options) {
            return llms(client, options);
        },
        llmsFull(options) {
            return llmsFull(client, options);
        },
        schema(command) {
            return schema(client, command);
        },
        help(command) {
            return help(client, command);
        },
        openapi() {
            return openapi(client);
        },
        skills: {
            index() {
                return skillsIndex(client);
            },
            get(name) {
                return skill(client, name);
            },
        },
        mcp: {
            tools() {
                return mcpTools(client);
            },
        },
    };
}
async function discover(client, request) {
    try {
        const response = await client.transport.discover(request);
        if ('body' in response)
            return response.body;
        return response.data;
    }
    catch (error) {
        if (error instanceof ClientError)
            throw error;
        const data = isRecord(error)
            ? {
                ok: false,
                error: {
                    code: typeof error.code === 'string' ? error.code : 'RESOURCES_ERROR',
                    message: error instanceof Error ? error.message : String(error),
                },
                meta: { resource: request.resource },
            }
            : undefined;
        throw new ClientError(error instanceof Error ? error.message : 'Resources request failed', {
            cause: error instanceof Error ? error : undefined,
            code: isRecord(error) && typeof error.code === 'string' ? error.code : 'RESOURCES_ERROR',
            data,
            error: isRecord(data) && isRecord(data.error) ? data.error : undefined,
            status: isRecord(error) && typeof error.status === 'number' ? error.status : undefined,
        });
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=ResourcesActions.js.map