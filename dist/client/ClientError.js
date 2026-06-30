import { BaseError } from '../Errors.js';
/** Error thrown by client transports. */
export class ClientError extends BaseError {
    name = 'Incur.ClientError';
    /** Machine-readable error code. */
    code;
    /** Full error envelope or diagnostic payload. */
    data;
    /** RPC error object. */
    error;
    /** Field validation errors. */
    fieldErrors;
    /** Response metadata. */
    meta;
    /** Whether the operation can be retried. */
    retryable;
    /** HTTP status when available. */
    status;
    constructor(message, options = {}) {
        super(message, options.cause ? { cause: options.cause } : undefined);
        this.code = options.code;
        this.data = options.data;
        this.error = options.error;
        this.fieldErrors = options.fieldErrors;
        this.meta = options.meta;
        this.retryable = options.retryable;
        this.status = options.status;
    }
}
//# sourceMappingURL=ClientError.js.map