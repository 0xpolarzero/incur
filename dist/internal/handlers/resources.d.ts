import type * as Resources from '../../client/Resources.js';
import { BaseError } from '../../Errors.js';
import * as RuntimeContext from '../runtime-context.js';
/** Resources failure with protocol code and HTTP status metadata. */
export declare class ResourcesError extends BaseError {
    name: string;
    /** Machine-readable error code. */
    code: string;
    /** HTTP status for discovery routes. */
    status: number;
    constructor(code: string, message: string, status: number);
}
/** Creates the shared in-process resources handler. */
export declare function createResourcesHandler(ctx: RuntimeContext.RuntimeCliContext): {
    discover(request: unknown): Promise<Resources.Response>;
};
//# sourceMappingURL=resources.d.ts.map