import * as Cli from '../../Cli.js';
import type * as Local from '../Local.js';
import type * as Resources from '../Resources.js';
import type * as Rpc from '../Rpc.js';
import type * as Transport from './Transport.js';
/** Memory transport factory. */
export type MemoryTransport = Transport.Factory<'memory', {
    request(request: Rpc.Request): Promise<Rpc.Response | Rpc.StreamResponse>;
    discover(request: Resources.Request): Promise<Resources.Response>;
    local: Local.Methods;
}>;
/** Memory transport options. */
export type Options = {
    /** Explicit environment source. */
    env?: Record<string, string | undefined> | undefined;
};
/** Creates an in-process memory transport. */
export declare function create(cli: Cli.Cli<any, any, any>, options?: Options): MemoryTransport;
//# sourceMappingURL=MemoryTransport.d.ts.map