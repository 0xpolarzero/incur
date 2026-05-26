import { describe, expect, test } from 'vitest'
import { z } from 'zod'

import * as Cli from '../../Cli.js'
import * as MemoryTransport from './MemoryTransport.js'

describe('MemoryTransport', () => {
  test('executes through shared runtime without calling cli.fetch and uses explicit env', async () => {
    const cli = Cli.create('app', {
      env: z.object({ TOKEN: z.string() }),
    }).command('status', {
      env: z.object({ TOKEN: z.string() }),
      run(c) {
        return { token: c.env.TOKEN }
      },
    })
    cli.fetch = async () => {
      throw new Error('fetch should not be called')
    }

    const transport = MemoryTransport.create(cli, { env: { TOKEN: 'secret' } })()
    await expect(transport.request({ command: 'status' })).resolves.toMatchObject({
      ok: true,
      data: { token: 'secret' },
    })
  })

  test('does not load config defaults for in-process requests', async () => {
    const cli = Cli.create('app', { config: {} }).command('status', {
      options: z.object({ name: z.string().default('runtime') }),
      run(c) {
        return c.options
      },
    })
    const transport = MemoryTransport.create(cli)()
    await expect(transport.request({ command: 'status' })).resolves.toMatchObject({
      ok: true,
      data: { name: 'runtime' },
    })
  })

  test('preserves CLI version for in-process execution and OpenAPI discovery', async () => {
    const cli = Cli.create('app', { version: '1.2.3' }).command('status', {
      run(c) {
        return { version: c.version }
      },
    })
    const transport = MemoryTransport.create(cli)()
    await expect(transport.request({ command: 'status' })).resolves.toMatchObject({
      ok: true,
      data: { version: '1.2.3' },
    })
    await expect(transport.discover({ resource: 'openapi' })).resolves.toMatchObject({
      contentType: 'application/json',
      data: { info: { version: '1.2.3' } },
    })
  })

  test('discovers help, skills, OpenAPI, and MCP tools', async () => {
    const cli = Cli.create('app', { description: 'App' }).command('status', {
      description: 'Show status',
      run() {
        return { ok: true }
      },
    })
    const transport = MemoryTransport.create(cli)()
    await expect(
      transport.discover({ resource: 'help', command: 'status' }),
    ).resolves.toMatchObject({
      contentType: 'text/plain',
      body: expect.stringContaining('Show status'),
    })
    await expect(transport.discover({ resource: 'skillsIndex' })).resolves.toMatchObject({
      contentType: 'application/json',
      data: { skills: expect.any(Array) },
    })
    await expect(transport.discover({ resource: 'openapi' })).resolves.toMatchObject({
      contentType: 'application/json',
      data: { openapi: '3.2.0' },
    })
    await expect(transport.discover({ resource: 'mcpTools' })).resolves.toMatchObject({
      contentType: 'application/json',
      data: { tools: [expect.objectContaining({ name: 'status' })] },
    })
  })

  test('exposes memory-only local capability', () => {
    const cli = Cli.create('app')
    const transport = MemoryTransport.create(cli)()
    expect(Object.keys(transport.local)).toEqual(['skills', 'mcp'])
    expect(typeof transport.local.skills.add).toBe('function')
    expect(typeof transport.local.skills.list).toBe('function')
    expect(typeof transport.local.mcp.add).toBe('function')
  })
})
