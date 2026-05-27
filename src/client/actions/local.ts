import type {
  ActionClient,
  McpAddOptions,
  SkillsAddOptions,
  SkillsList,
  SkillsListOptions,
} from '../types.js'

/** Runs memory-local `skills add`. */
export function skillsAdd(client: ActionClient, options?: SkillsAddOptions | undefined) {
  return local(client).skills.add(options)
}

/** Runs memory-local `skills list`. */
export function skillsList(client: ActionClient, options?: SkillsListOptions | undefined) {
  return local(client).skills.list(options)
}

/** Runs memory-local `mcp add`. */
export function mcpAdd(client: ActionClient, options?: McpAddOptions | undefined) {
  return local(client).mcp.add(options)
}

function local(client: ActionClient) {
  return client.transport.local as {
    skills: {
      add(options?: SkillsAddOptions | undefined): Promise<unknown>
      list(options?: SkillsListOptions | undefined): Promise<SkillsList>
    }
    mcp: {
      add(options?: McpAddOptions | undefined): Promise<unknown>
    }
  }
}
