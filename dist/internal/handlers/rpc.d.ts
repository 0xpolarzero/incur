import type * as Rpc from '../../client/Rpc.js';
import * as RuntimeContext from '../runtime-context.js';
/** Returns the HTTP status for an RPC error code. */
export declare function getRpcStatus(code: string): 404 | 400 | 500;
/** Creates the shared in-process RPC handler. */
export declare function createRpcHandler(ctx: RuntimeContext.RuntimeCliContext, options?: createRpcHandler.Options): {
    request(request: unknown): Promise<Rpc.Response | Rpc.StreamResponse>;
};
export declare namespace createRpcHandler {
    /** Execution options. */
    type Options = {
        /** Explicit environment source. */
        env?: Record<string, string | undefined> | undefined;
    };
}
//# sourceMappingURL=rpc.d.ts.map