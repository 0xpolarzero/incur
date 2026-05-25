import { BaseError } from '../Errors.js'

/** Error thrown by client transports. */
export class ClientError extends BaseError {
  override name = 'Incur.ClientError'
}
