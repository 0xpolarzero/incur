/** Transport context supplied when resolving a transport factory. */
export type TransportContext = {
  /** Client uid. */
  uid: string
}

/** Transport type names. */
export type TransportType = 'http' | 'memory'

/** Transport configuration. */
export type TransportConfig<type extends TransportType> = {
  /** Stable transport key. */
  key: string
  /** Human-readable transport name. */
  name: string
  /** Transport type. */
  type: type
}

/** Transport value object. */
export type TransportValue = Record<string, unknown>

/** Transport factory. */
export type TransportFactory<type extends TransportType, value extends TransportValue> = (
  context: TransportContext,
) => {
  config: TransportConfig<type>
  value: value
}
