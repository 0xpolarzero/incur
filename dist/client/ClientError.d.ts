import { BaseError } from '../Errors.js';
import type * as Rpc from './Rpc.js';
/** Error thrown by client transports. */
export declare class ClientError extends BaseError {
    name: string;
    /** Machine-readable error code. */
    code: string | undefined;
    /** Full error envelope or diagnostic payload. */
    data: unknown | undefined;
    /** RPC error object. */
    error: Rpc.Error | undefined;
    /** Field validation errors. */
    fieldErrors: Rpc.Error['fieldErrors'] | undefined;
    /** Response metadata. */
    meta: Rpc.Meta | undefined;
    /** Whether the operation can be retried. */
    retryable: boolean | undefined;
    /** HTTP status when available. */
    status: number | undefined;
    constructor(message: string, options?: ClientError.Options);
}
export declare namespace ClientError {
    /** Client error constructor options. */
    type Options = BaseError.Options & {
        /** Machine-readable error code. */
        code?: string | undefined;
        /** Full error envelope or diagnostic payload. */
        data?: unknown | undefined;
        /** RPC error object. */
        error?: Rpc.Error | undefined;
        /** Field validation errors. */
        fieldErrors?: Rpc.Error['fieldErrors'] | undefined;
        /** Response metadata. */
        meta?: Rpc.Meta | undefined;
        /** Whether the operation can be retried. */
        retryable?: boolean | undefined;
        /** HTTP status when available. */
        status?: number | undefined;
    };
}
//# sourceMappingURL=ClientError.d.ts.map