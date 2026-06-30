import type * as Client from '../Client.js';
import type * as Resources from '../Resources.js';
import type { ActionClient } from './ActionClient.js';
/** LLM resource action options. */
export type LlmsOptions = {
    command?: string | undefined;
    format?: Resources.Format | undefined;
};
/** Reads compact LLM resources. */
export declare function llms(client: ActionClient, options?: LlmsOptions): Promise<unknown>;
/** Reads full LLM resources. */
export declare function llmsFull(client: ActionClient, options?: LlmsOptions): Promise<unknown>;
/** Reads a command schema. */
export declare function schema(client: ActionClient, command?: Client.CommandScope<any> | undefined): Promise<Record<string, unknown>>;
/** Reads help text. */
export declare function help(client: ActionClient, command?: Client.CommandScope<any> | undefined): Promise<string>;
/** Reads the OpenAPI document. */
export declare function openapi(client: ActionClient): Promise<Resources.OpenApiDocument>;
/** Reads the generated skills index. */
export declare function skillsIndex(client: ActionClient): Promise<Resources.SkillsIndex>;
/** Reads a generated skill file. */
export declare function skill(client: ActionClient, name: string): Promise<string>;
/** Reads MCP tool descriptors. */
export declare function mcpTools(client: ActionClient): Promise<Resources.McpToolsResponse>;
/** Binds resource actions to a client. */
export declare function actions(client: ActionClient): {
    llms(options?: LlmsOptions | undefined): Promise<unknown>;
    llmsFull(options?: LlmsOptions | undefined): Promise<unknown>;
    schema(command?: Client.CommandScope<any> | undefined): Promise<Record<string, unknown>>;
    help(command?: Client.CommandScope<any> | undefined): Promise<string>;
    openapi(): Promise<Resources.OpenApiDocument>;
    skills: {
        index(): Promise<Resources.SkillsIndex>;
        get(name: string): Promise<string>;
    };
    mcp: {
        tools(): Promise<Resources.McpToolsResponse<{}>>;
    };
};
//# sourceMappingURL=ResourcesActions.d.ts.map