import type * as Client from '../Client.js';
import type { ActionClient } from './ActionClient.js';
/** Runtime input accepted by the untyped run action wrapper. */
export type Input = Client.Defaults & {
    args?: unknown;
    options?: unknown;
};
/** Executes a command through a client transport. */
export declare function run(client: ActionClient, command: string, input: Input | undefined): Promise<unknown>;
/** Binds command run actions to a client. */
export declare function actions(client: ActionClient): {
    run(command: string, input?: Input | undefined): Promise<unknown>;
};
//# sourceMappingURL=RunActions.d.ts.map