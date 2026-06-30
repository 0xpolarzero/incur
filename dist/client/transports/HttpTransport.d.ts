import type * as Resources from '../Resources.js';
import type * as Rpc from '../Rpc.js';
import type * as Transport from './Transport.js';
/** HTTP transport factory. */
export type HttpTransport = Transport.Factory<'http', {
    baseUrl: URL;
    request(request: Rpc.Request): Promise<Rpc.Response | Rpc.StreamResponse>;
    discover(request: Resources.Request): Promise<Resources.Response>;
}>;
/** HTTP transport options. */
export type Options = {
    /** Base URL for the served CLI. */
    baseUrl: string | URL;
    /** Fetch implementation. Defaults to globalThis.fetch. */
    fetch?: typeof globalThis.fetch | undefined;
    /** Headers merged into every request. */
    headers?: HeadersInit | undefined;
};
/** Creates an HTTP transport. */
export declare function create(options: Options): HttpTransport;
//# sourceMappingURL=HttpTransport.d.ts.map