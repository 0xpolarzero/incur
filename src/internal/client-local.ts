import * as SyncMcp from '../SyncMcp.js'
import * as SyncSkills from '../SyncSkills.js'
import type * as CommandTree from './command-tree.js'

/** Options for `skills.add()`. */
export type SkillsAddOptions = {
  /** Grouping depth. */
  depth?: number | undefined
  /** Install globally instead of project-local. */
  global?: boolean | undefined
}

/** Options for `skills.list()`. */
export type SkillsListOptions = {
  /** Grouping depth. */
  depth?: number | undefined
}

/** Options for `mcp.add()`. */
export type McpAddOptions = {
  /** Target agents. */
  agents?: string[] | undefined
  /** Command agents should run. */
  command?: string | undefined
  /** Install globally instead of project-local. */
  global?: boolean | undefined
}

/** Synced skills result. */
export type SyncedSkills = SyncSkills.sync.Result

/** Skills list result. */
export type SkillsList = SyncSkills.list.Skill[]

/** MCP registration result. */
export type McpRegistration = SyncMcp.register.Result

/** Local memory-only runtime. */
export type LocalRuntime = {
  /** Skill setup actions. */
  skills: {
    add(options?: SkillsAddOptions | undefined): Promise<SyncedSkills>
    list(options?: SkillsListOptions | undefined): Promise<SkillsList>
  }
  /** MCP setup actions. */
  mcp: {
    add(options?: McpAddOptions | undefined): Promise<McpRegistration>
  }
}

/** Creates local setup/admin wrappers for a memory transport. */
export function createLocalRuntime(ctx: CommandTree.RuntimeCliContext): LocalRuntime {
  return {
    skills: {
      add(options: SkillsAddOptions = {}) {
        return SyncSkills.sync(ctx.name, ctx.commands, {
          cwd: ctx.sync?.cwd,
          depth: options.depth ?? ctx.sync?.depth ?? 1,
          description: ctx.description,
          global: options.global ?? true,
          include: ctx.sync?.include,
          rootCommand: ctx.rootCommand,
        })
      },
      list(options: SkillsListOptions = {}) {
        return SyncSkills.list(ctx.name, ctx.commands, {
          cwd: ctx.sync?.cwd,
          depth: options.depth ?? ctx.sync?.depth ?? 1,
          description: ctx.description,
          include: ctx.sync?.include,
          rootCommand: ctx.rootCommand,
        })
      },
    },
    mcp: {
      add(options: McpAddOptions = {}) {
        return SyncMcp.register(ctx.name, {
          agents: options.agents ?? ctx.mcp?.agents,
          command: options.command ?? ctx.mcp?.command,
          global: options.global ?? true,
        })
      },
    },
  }
}
