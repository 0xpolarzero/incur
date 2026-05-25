import { BaseError } from '../Errors.js'

/** Error thrown by client transports. */
export class ClientError extends BaseError {
  override name = 'Incur.ClientError'
}

/** Returns true when a value is a client RPC error envelope. */
export function isClientRpcErrorEnvelope(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { ok?: unknown }).ok === false &&
    typeof (value as { error?: { code?: unknown } }).error?.code === 'string'
  )
}

/** Returns true when a value is a client RPC error object. */
export function isClientRpcError(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { code?: unknown }).code === 'string' &&
    typeof (value as { message?: unknown }).message === 'string'
  )
}
