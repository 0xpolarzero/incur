import * as LocalActions from './actions/LocalActions.js';
import * as ResourcesActions from './actions/ResourcesActions.js';
import * as RunActions from './actions/RunActions.js';
export { ClientError } from './ClientError.js';
/** Creates a typed client from a transport factory. */
export function create(options) {
    const { transport, ...defaults } = options;
    const resolved = transport();
    const { config, ...capabilities } = resolved;
    const client = {
        defaults,
        transport: { ...config, ...capabilities },
        type: 'client',
    };
    return {
        ...client,
        ...actions(client),
    };
}
function actions(client) {
    const base = {
        ...RunActions.actions(client),
        ...ResourcesActions.actions(client),
    };
    if (!client.transport.local)
        return base;
    const memory = LocalActions.actions(client);
    return {
        ...base,
        ...memory,
        skills: {
            ...base.skills,
            ...memory.skills,
        },
        mcp: {
            ...base.mcp,
            ...memory.mcp,
        },
    };
}
//# sourceMappingURL=Client.js.map