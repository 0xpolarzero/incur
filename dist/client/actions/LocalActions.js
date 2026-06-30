import { ClientError } from '../ClientError.js';
/** Runs memory-local `skills add`. */
export function skillsAdd(client, options) {
    return local(client).skills.add(options);
}
/** Runs memory-local `skills list`. */
export function skillsList(client, options) {
    return local(client).skills.list(options);
}
/** Runs memory-local `mcp add`. */
export function mcpAdd(client, options) {
    return local(client).mcp.add(options);
}
/** Binds memory-local actions to a client. */
export function actions(client) {
    return {
        skills: {
            add(options) {
                return skillsAdd(client, options);
            },
            list(options) {
                return skillsList(client, options);
            },
        },
        mcp: {
            add(options) {
                return mcpAdd(client, options);
            },
        },
    };
}
function local(client) {
    const { local } = client.transport;
    if (!local)
        throw new ClientError('Local actions require a memory client.');
    return local;
}
//# sourceMappingURL=LocalActions.js.map