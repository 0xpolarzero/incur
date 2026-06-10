import * as Client from './Client.js';
import * as HttpTransport from './transports/HttpTransport.js';
/** Creates an HTTP typed client. */
export function create(options) {
    const { baseUrl, fetch, headers, ...defaults } = options;
    return Client.create({
        ...defaults,
        transport: HttpTransport.create({
            baseUrl,
            ...(fetch ? { fetch } : undefined),
            ...(headers ? { headers } : undefined),
        }),
    });
}
//# sourceMappingURL=HttpClient.js.map