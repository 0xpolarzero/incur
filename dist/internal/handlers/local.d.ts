import type * as Local from '../../client/Local.js';
import { BaseError } from '../../Errors.js';
import * as SyncMcp from '../../SyncMcp.js';
import * as SyncSkills from '../../SyncSkills.js';
import type * as RuntimeContext from '../runtime-context.js';
/** Local setup/admin failure. */
export declare class LocalError extends BaseError {
    name: string;
}
/** Creates the shared in-process local handler. */
export declare function createLocalHandler(ctx: RuntimeContext.RuntimeCliContext): {
    local: {
        skills: {
            add(options?: Local.SkillsAddOptions): Promise<SyncSkills.sync.Result>;
            list(options?: Local.SkillsListOptions): Promise<{
                skills: SyncSkills.list.Skill[];
            }>;
        };
        mcp: {
            add(options?: Local.McpAddOptions): Promise<SyncMcp.register.Result>;
        };
    };
};
//# sourceMappingURL=local.d.ts.map