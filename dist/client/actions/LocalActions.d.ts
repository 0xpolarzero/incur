import type * as Local from '../Local.js';
import type { ActionClient } from './ActionClient.js';
/** Runs memory-local `skills add`. */
export declare function skillsAdd(client: ActionClient, options?: Local.SkillsAddOptions | undefined): Promise<import("../../SyncSkills.js").sync.Result>;
/** Runs memory-local `skills list`. */
export declare function skillsList(client: ActionClient, options?: Local.SkillsListOptions | undefined): Promise<Local.SkillsList>;
/** Runs memory-local `mcp add`. */
export declare function mcpAdd(client: ActionClient, options?: Local.McpAddOptions | undefined): Promise<import("../../SyncMcp.js").register.Result>;
/** Binds memory-local actions to a client. */
export declare function actions(client: ActionClient): {
    skills: {
        add(options?: Local.SkillsAddOptions | undefined): Promise<import("../../SyncSkills.js").sync.Result>;
        list(options?: Local.SkillsListOptions | undefined): Promise<Local.SkillsList>;
    };
    mcp: {
        add(options?: Local.McpAddOptions | undefined): Promise<import("../../SyncMcp.js").register.Result>;
    };
};
//# sourceMappingURL=LocalActions.d.ts.map