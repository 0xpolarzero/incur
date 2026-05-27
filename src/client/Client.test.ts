import { describe, expect, test, vi } from 'vitest'

import * as Cli from '../Cli.js'
import * as Client from './Client.js'
import * as HttpClient from './HttpClient.js'
import type * as Local from './Local.js'
import * as MemoryClient from './MemoryClient.js'
import type {
  Request as RpcRequest,
  Response as RpcResponse,
  StreamResponse as RpcStreamResponse,
} from './Rpc.js'
import * as HttpTransport from './transports/HttpTransport.js'
import type * as MemoryTransport from './transports/MemoryTransport.js'

function mockTransport(): HttpTransport.HttpTransport {
  return () => ({
    config: { key: 'mock', name: 'Mock', type: 'http' as const },
    baseUrl: new URL('https://example.com'),
    discover: vi.fn(),
    request: vi.fn(
      async (_request: RpcRequest): Promise<RpcResponse | RpcStreamResponse> => ({
        ok: true,
        data: { ok: true },
        meta: { command: 'status', duration: '1ms' },
      }),
    ),
  })
}

describe('Client.create', () => {
  test('resolves the transport factory exactly once and keeps resolved capabilities', async () => {
    const request = vi.fn(
      async (_request: RpcRequest): Promise<RpcResponse> => ({
        ok: true,
        data: { ok: true },
        meta: { command: 'status', duration: '1ms' },
      }),
    )
    const discover = vi.fn(async () => ({ contentType: 'text/plain', body: 'help' }))
    const transport = vi.fn(() => ({
      config: { key: 'mock', name: 'Mock', type: 'http' as const },
      baseUrl: new URL('https://example.com'),
      discover,
      request,
    })) satisfies HttpTransport.HttpTransport

    const client = Client.create({ transport })

    expect(transport).toHaveBeenCalledTimes(1)
    expect(client.transport.request).toBe(request)
    expect(client.transport.discover).toBe(discover)
    await client.run('status' as never)
    await client.help()
    expect(request).toHaveBeenCalledTimes(1)
    expect(discover).toHaveBeenCalledTimes(1)
  })

  test('propagates transport factory errors', () => {
    const transport = (() => {
      throw new Error('cannot connect')
    }) as HttpTransport.HttpTransport

    expect(() => Client.create({ transport })).toThrow('cannot connect')
  })

  test('resolves transport, assigns uid, preserves defaults, and binds actions', async () => {
    const client = Client.create({
      outputFormat: 'toon',
      transport: mockTransport(),
    })

    expect(client).toMatchObject({
      defaults: { outputFormat: 'toon' },
      transport: { key: 'mock', name: 'Mock', type: 'http' },
      type: 'client',
    })
    await expect(client.run('status' as never)).resolves.toMatchObject({
      ok: true,
      data: { ok: true },
    })
  })

  test('HttpClient.create is a thin wrapper over HttpTransport.create', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ ok: true, data: 1, meta: { command: 'status', duration: '1ms' } }),
          { headers: { 'content-type': 'application/json' } },
        ),
    ) as typeof globalThis.fetch

    const client = HttpClient.create({ baseUrl: 'https://example.com/api', fetch })
    expect(client.transport.baseUrl.href).toBe('https://example.com/api')
    await client.run('status' as never)
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://example.com/api/_incur/rpc'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  test('MemoryClient.create uses memory transport and exposes local actions', () => {
    const cli = Cli.create('app')
    const client = MemoryClient.create(cli)

    expect(client.transport.type).toBe('memory')
    expect(typeof client.skills.add).toBe('function')
    expect(typeof client.skills.list).toBe('function')
    expect(typeof client.mcp.add).toBe('function')
  })

  test('http client has no runtime local action methods', () => {
    const client = Client.create({
      transport: HttpTransport.create({ baseUrl: 'https://example.com' }),
    })
    expect('add' in client.skills).toBe(false)
    expect('list' in client.skills).toBe(false)
    expect('add' in client.mcp).toBe(false)
  })

  test('memory clients merge resource and local methods in shared namespaces', async () => {
    const local: Local.Methods = {
      skills: {
        add: vi.fn(async () => ({ agents: [], paths: [], skills: [] })),
        list: vi.fn(async () => ({ skills: [] })),
      },
      mcp: {
        add: vi.fn(async () => ({ agents: [], command: 'app --mcp' })),
      },
    }
    const transport = (() => ({
      config: { key: 'memory', name: 'Memory', type: 'memory' as const },
      discover: vi.fn(async () => ({ contentType: 'application/json', data: { skills: [] } })),
      local,
      request: vi.fn(),
    })) satisfies MemoryTransport.MemoryTransport

    const client = Client.create({ transport })

    await expect(client.skills.index()).resolves.toEqual({ skills: [] })
    await expect(client.skills.list()).resolves.toEqual({ skills: [] })
    await expect(client.skills.add()).resolves.toEqual({ agents: [], paths: [], skills: [] })
    await expect(client.mcp.add()).resolves.toEqual({ agents: [], command: 'app --mcp' })
    expect(typeof client.mcp.tools).toBe('function')
  })

  test('missing fetch implementation throws ClientError', () => {
    const original = globalThis.fetch
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: undefined })
    try {
      expect(() => HttpClient.create({ baseUrl: 'https://example.com' })).toThrow(
        Client.ClientError,
      )
    } finally {
      Object.defineProperty(globalThis, 'fetch', { configurable: true, value: original })
    }
  })
})
