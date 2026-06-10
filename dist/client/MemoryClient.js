import * as Client from './Client.js';
import * as MemoryTransport from './transports/MemoryTransport.js';
export function create(cli, options = {}) {
    const { env, ...defaults } = options;
    return Client.create({
        ...defaults,
        transport: MemoryTransport.create(cli, { env }),
    });
}
//# sourceMappingURL=MemoryClient.js.map