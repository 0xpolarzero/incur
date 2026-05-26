import { describe, expect, test, vi } from 'vitest'
import { parse as yamlParse } from 'yaml'
import { z } from 'zod'

vi.mock('./SyncSkills.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./SyncSkills.js')>()
  return { ...actual, readHash: () => undefined }
})

import { app as prefixedApp } from '../test/fixtures/hono-api-prefixed.js'
import { app } from '../test/fixtures/hono-api.js'
import { app as openapiApp, spec as openapiSpec } from '../test/fixtures/hono-openapi-app.js'
import { spec } from '../test/fixtures/openapi-spec.js'
import * as Cli from './Cli.js'
import * as Completions from './Completions.js'
import * as Fetch from './Fetch.js'
import * as Help from './Help.js'
import * as Openapi from './Openapi.js'
import * as Parser from './Parser.js'
import * as Schema from './Schema.js'

function serve(cli: { serve: Cli.Cli['serve'] }, argv: string[]) {
  let output = ''
  let exitCode: number | undefined
  return cli
    .serve(argv, {
      stdout: (s) => (output += s),
      exit: (c) => {
        exitCode = c
      },
    })
    .then(() => ({
      output,
      exitCode,
    }))
}

function json(output: string) {
  return JSON.parse(output.replace(/"duration": "[^"]+"/g, '"duration": "<stripped>"'))
}

function command(commands: Map<string, any>, name: string) {
  const entry = commands.get(name)
  if (!entry || '_group' in entry) throw new Error(`expected ${name} command`)
  return entry
}

function openapiUrl() {
  return `data:application/json,${encodeURIComponent(JSON.stringify(spec))}`
}

function hostedApiFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init)
    const url = new URL(request.url)

    if (url.href === 'https://api.example.com/api/openapi.json') return Response.json(spec)
    if (url.pathname === '/api/users') {
      url.pathname = '/users'
      return app.fetch(new Request(url, request))
    }

    return new Response('Not Found', { status: 404 })
  })
}

describe('fromCli', () => {
  test('generates OpenAPI 3.2 paths with inferred methods', () => {
    const cli = Cli.create('api', { description: 'API', version: '1.2.3' })
      .command('users list', {
        description: 'List users',
        options: z.object({ limit: z.coerce.number().optional() }),
        output: z.object({ users: z.array(z.object({ id: z.string() })) }),
        run() {
          return { users: [] }
        },
      })
      .command('users update', {
        description: 'Update a user',
        args: z.object({ id: z.string() }),
        options: z.object({ name: z.string() }),
        run() {
          return { ok: true }
        },
      })
      .command('users delete', {
        args: z.object({ id: z.string() }),
        run() {
          return { ok: true }
        },
      })

    const spec = Openapi.fromCli(cli)
    expect(spec.openapi).toBe('3.2.0')
    expect(spec.info).toEqual({ title: 'api', version: '0.0.0', description: 'API' })
    expect(spec.paths?.['/users/list']?.get).toMatchObject({
      operationId: 'getUsersList',
      summary: 'List users',
      parameters: [{ name: 'limit', in: 'query', schema: { type: 'number' } }],
    })
    expect(spec.paths?.['/users/update/{id}']?.patch).toMatchObject({
      operationId: 'patchUsersUpdateId',
      summary: 'Update a user',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: { name: { type: 'string' } },
            },
          },
        },
      },
    })
    expect(spec.paths?.['/users/delete/{id}']?.delete).toMatchObject({
      operationId: 'deleteUsersDeleteId',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    })
  })

  test('serves generated OpenAPI schema', async () => {
    const cli = Cli.create('api', { description: 'API' }).command('status', {
      run() {
        return { ok: true }
      },
    })

    const jsonResponse = await cli.fetch(new Request('http://localhost/openapi.json'))
    const json = await jsonResponse.json()
    expect(json.openapi).toBe('3.2.0')
    expect(json.paths['/status'].get.operationId).toBe('getStatus')

    const wellKnownResponse = await cli.fetch(
      new Request('http://localhost/.well-known/openapi.json'),
    )
    expect(await wellKnownResponse.json()).toMatchObject(json)

    const ymlResponse = await cli.fetch(new Request('http://localhost/openapi.yml'))
    expect(ymlResponse.headers.get('content-type')).toBe('application/yaml')
    expect(yamlParse(await ymlResponse.text()).paths['/status'].get.operationId).toBe('getStatus')

    const yamlResponse = await cli.fetch(new Request('http://localhost/openapi.yaml'))
    expect(yamlParse(await yamlResponse.text()).openapi).toBe('3.2.0')
  })
})

describe('generateCommands', () => {
  test('generates command entries from spec', async () => {
    const commands = await Openapi.generateCommands(spec, app.fetch)
    expect(commands.has('listUsers')).toBe(true)
    expect(commands.has('createUser')).toBe(true)
    expect(commands.has('getUser')).toBe(true)
    expect(commands.has('deleteUser')).toBe(true)
    expect(commands.has('healthCheck')).toBe(true)
  })

  test('command has description from summary', async () => {
    const commands = await Openapi.generateCommands(spec, app.fetch)
    const cmd = command(commands, 'listUsers')
    expect(cmd.description).toBe('List users')
  })

  test('coerced number params preserve description', async () => {
    const commands = await Openapi.generateCommands(spec, app.fetch)
    const cmd = command(commands, 'listUsers')
    const limitSchema = cmd.options!.shape.limit
    expect(limitSchema.description).toBe('Max results')
  })

  test('infers output and supports fallback command names', async () => {
    const commands = await Openapi.generateCommands(
      {
        paths: {
          '/users/posts': {
            get: {
              responses: {
                '204': {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: { ok: { type: 'boolean' } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      (req) => {
        expect(new URL(req.url).pathname).toBe('/users/posts')
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json' },
        })
      },
    )
    const cmd = command(commands, 'get users posts')
    expect(cmd.output).toBeDefined()
    await cmd.run({
      args: {},
      options: {},
      error: (value: unknown) => value,
    })
  })

  test('generates namespace command groups from paths', async () => {
    const commands = await Openapi.generateCommands(spec, app.fetch, {
      config: { mode: 'namespace' },
    })
    expect([...commands.keys()].sort()).toMatchInlineSnapshot(`
      [
        "health",
        "users",
      ]
    `)

    const users = commands.get('users')!
    expect('_group' in users).toMatchInlineSnapshot(`true`)
    expect('_group' in users ? users.description : undefined).toMatchInlineSnapshot(`"List users"`)
    expect('_group' in users ? [...users.commands.keys()].sort() : []).toMatchInlineSnapshot(`
      [
        "get",
        "id",
        "post",
      ]
    `)

    const id = '_group' in users ? users.commands.get('id')! : undefined
    expect(id && '_group' in id ? id.description : undefined).toMatchInlineSnapshot(`"User ID"`)
    expect(id && '_group' in id ? [...id.commands.keys()].sort() : []).toMatchInlineSnapshot(`
      [
        "delete",
        "get",
      ]
    `)
  })

  test('path-level parameters are applied and non-operation fields are ignored', async () => {
    const commands = await Openapi.generateCommands(
      {
        paths: {
          '/orgs/{orgId}/users': {
            parameters: [
              {
                name: 'orgId',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
            ],
            get: {
              operationId: 'listOrgUsers',
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      },
      app.fetch,
    )

    expect(commands.has('parameters__orgs__orgId__users')).toBe(false)
    expect(command(commands, 'listOrgUsers').args!.safeParse({ orgId: 'acme' }).success).toBe(true)
  })

  test('path-level query parameter is inherited', async () => {
    const commands = await Openapi.generateCommands(
      {
        paths: {
          '/users': {
            parameters: [
              {
                name: 'active',
                in: 'query',
                schema: { type: 'boolean' },
              },
            ],
            get: {
              operationId: 'listUsers',
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      },
      app.fetch,
    )

    const options = command(commands, 'listUsers').options!
    expect(options.parse({ active: 'true' }).active).toBe(true)
  })

  test('operation-level parameter overrides path-level same in:name', async () => {
    const commands = await Openapi.generateCommands(
      {
        paths: {
          '/users': {
            parameters: [
              {
                name: 'filter',
                in: 'query',
                schema: { enum: ['path'] },
              },
            ],
            get: {
              operationId: 'listUsers',
              parameters: [
                {
                  name: 'filter',
                  in: 'query',
                  schema: { enum: ['operation'] },
                },
              ],
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      },
      app.fetch,
    )

    const options = command(commands, 'listUsers').options!
    expect(options.safeParse({ filter: 'operation' }).success).toBe(true)
    expect(options.safeParse({ filter: 'path' }).success).toBe(false)
  })

  test('OpenAPI 3.2 query and additionalOperations generate commands', async () => {
    const calls: { method: string; path: string; query: Record<string, string> }[] = []
    const commands = await Openapi.generateCommands(
      {
        paths: {
          '/widgets/{id}/actions': {
            summary: 'Widget actions',
            'x-note': 'metadata',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            query: {
              operationId: 'queryWidgetActions',
              parameters: [{ name: 'filter', in: 'query', schema: { type: 'string' } }],
              responses: { '200': { description: 'ok' } },
            },
            additionalOperations: {
              Search: {
                operationId: 'searchWidgetActions',
                parameters: [{ name: 'cursor', in: 'query', schema: { type: 'string' } }],
                responses: { '200': { description: 'ok' } },
              },
            },
          },
        },
      },
      (req) => {
        const url = new URL(req.url)
        calls.push({
          method: req.method,
          path: url.pathname,
          query: Object.fromEntries(url.searchParams),
        })
        return Response.json({})
      },
    )

    expect(commands.has('queryWidgetActions')).toBe(true)
    expect(commands.has('searchWidgetActions')).toBe(true)
    expect(commands.has('summary__widgets__id__actions')).toBe(false)
    expect(commands.has('additionalOperations__widgets__id__actions')).toBe(false)

    await command(commands, 'queryWidgetActions').run({
      args: { id: 'a/b' },
      options: { filter: 'open' },
      error: (value: unknown) => value,
    })
    await command(commands, 'searchWidgetActions').run({
      args: { id: 'a b' },
      options: { cursor: 'next' },
      error: (value: unknown) => value,
    })

    expect(calls).toEqual([
      { method: 'QUERY', path: '/widgets/a%2Fb/actions', query: { filter: 'open' } },
      { method: 'Search', path: '/widgets/a%20b/actions', query: { cursor: 'next' } },
    ])
  })

  test('encodes interpolated path parameters', async () => {
    const calls: string[] = []
    const commands = await Openapi.generateCommands(
      {
        paths: {
          '/users/{id}': {
            get: {
              operationId: 'getUser',
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      },
      (req) => {
        calls.push(new URL(req.url).pathname)
        return new Response('{}', { headers: { 'content-type': 'application/json' } })
      },
    )

    await command(commands, 'getUser').run({
      args: { id: 'a/b' },
      options: {},
      error: (value: unknown) => value,
    })

    expect(calls).toEqual(['/users/a%2Fb'])
  })

  test('optional request body enforces required properties only when body is provided', async () => {
    const commands = await Openapi.generateCommands(
      {
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                required: false,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['name'],
                      properties: { name: { type: 'string' }, age: { type: 'number' } },
                    },
                  },
                },
              },
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      },
      app.fetch,
    )

    const options = command(commands, 'createUser').options!
    expect(options.safeParse({}).success).toBe(true)
    expect(options.safeParse({ name: 'Alice' }).success).toBe(true)
    expect(options.safeParse({ age: 42 }).success).toBe(false)
  })

  test('query options do not make optional request bodies count as provided', async () => {
    const commands = await Openapi.generateCommands(
      {
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              parameters: [{ name: 'dryRun', in: 'query', schema: { type: 'boolean' } }],
              requestBody: {
                required: false,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['name'],
                      properties: { name: { type: 'string' }, age: { type: 'number' } },
                    },
                  },
                },
              },
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      },
      app.fetch,
    )

    const options = command(commands, 'createUser').options!
    expect(options.safeParse({ dryRun: true }).success).toBe(true)
    expect(options.safeParse({ dryRun: true, age: 42 }).success).toBe(false)
  })

  test('optional request body ignores defaults when deciding whether body is provided', async () => {
    const commands = await Openapi.generateCommands(
      {
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                required: false,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['name'],
                      properties: {
                        name: { type: 'string' },
                        dryRun: { type: 'boolean', default: false },
                      },
                    },
                  },
                },
              },
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      },
      app.fetch,
    )

    const options = command(commands, 'createUser').options!
    expect(options.safeParse({}).success).toBe(true)
    expect(options.safeParse({ dryRun: false }).success).toBe(false)
    expect(options.safeParse({ name: 'Alice' }).success).toBe(true)
  })

  test('body boolean string coercion accepts true and false only', async () => {
    const commands = await Openapi.generateCommands(
      {
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        active: { type: 'boolean', default: false },
                      },
                    },
                  },
                },
              },
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      },
      app.fetch,
    )

    const options = command(commands, 'createUser').options!
    expect(options.parse({ active: 'true' }).active).toBe(true)
    expect(options.parse({ active: 'false' }).active).toBe(false)
    expect(options.parse({}).active).toBe(false)
    expect(options.safeParse({ active: 'yes' }).success).toBe(false)
  })

  test('required request body requires required properties', async () => {
    const commands = await Openapi.generateCommands(
      {
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['name'],
                      properties: { name: { type: 'string' }, age: { type: 'number' } },
                    },
                  },
                },
              },
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      },
      app.fetch,
    )

    const options = command(commands, 'createUser').options!
    expect(options.safeParse({}).success).toBe(false)
    expect(options.safeParse({ name: 'Alice' }).success).toBe(true)
  })

  test('required request body sends empty object when no body fields are provided', async () => {
    const bodies: string[] = []
    const commands = await Openapi.generateCommands(
      {
        paths: {
          '/profile': {
            post: {
              operationId: 'updateProfile',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: { nickname: { type: 'string' } },
                    },
                  },
                },
              },
              responses: { '200': { description: 'ok' } },
            },
          },
          '/empty': {
            post: {
              operationId: 'createEmpty',
              requestBody: {
                required: true,
                content: { 'application/json': { schema: { type: 'object', properties: {} } } },
              },
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      },
      async (req) => {
        bodies.push(await req.text())
        return new Response('{}', { headers: { 'content-type': 'application/json' } })
      },
    )

    await command(commands, 'updateProfile').run({ options: {}, error: (value: unknown) => value })
    await command(commands, 'createEmpty').run({ options: {}, error: (value: unknown) => value })

    expect(bodies).toEqual(['{}', '{}'])
  })

  test('required non-object request bodies do not synthesize JSON objects', async () => {
    const calls: { body: string; contentType: string | null; path: string }[] = []
    const commands = await Openapi.generateCommands(
      {
        paths: {
          '/scalar': {
            post: {
              operationId: 'postScalar',
              requestBody: {
                required: true,
                content: { 'application/json': { schema: { type: 'string' } } },
              },
              responses: { '200': { description: 'ok' } },
            },
          },
          '/array': {
            post: {
              operationId: 'postArray',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
              responses: { '200': { description: 'ok' } },
            },
          },
          '/plain': {
            post: {
              operationId: 'postPlain',
              requestBody: {
                required: true,
                content: { 'text/plain': { schema: { type: 'string' } } },
              },
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      },
      async (req) => {
        calls.push({
          path: new URL(req.url).pathname,
          body: await req.text(),
          contentType: req.headers.get('content-type'),
        })
        return Response.json({})
      },
    )

    for (const name of ['postScalar', 'postArray', 'postPlain'])
      await command(commands, name).run({ options: {}, error: (value: unknown) => value })

    expect(calls).toEqual([
      { path: '/scalar', body: '', contentType: null },
      { path: '/array', body: '', contentType: null },
      { path: '/plain', body: '', contentType: null },
    ])
  })

  test('boolean string coercion accepts true and false only', async () => {
    const commands = await Openapi.generateCommands(
      {
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              parameters: [
                {
                  name: 'active',
                  in: 'query',
                  schema: { type: 'boolean' },
                },
              ],
              responses: { '200': { description: 'ok' } },
            },
          },
          '/users/{active}': {
            get: {
              operationId: 'getUsersByActive',
              parameters: [
                {
                  name: 'active',
                  in: 'path',
                  required: true,
                  schema: { type: 'boolean' },
                },
              ],
              responses: { '200': { description: 'ok' } },
            },
          },
          '/defaulted': {
            get: {
              operationId: 'listDefaulted',
              parameters: [
                {
                  name: 'active',
                  in: 'query',
                  schema: { type: 'boolean', default: false },
                },
              ],
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      },
      app.fetch,
    )
    const query = command(commands, 'listUsers').options!
    const args = command(commands, 'getUsersByActive').args!
    const defaulted = command(commands, 'listDefaulted').options!

    expect(query.parse({ active: 'true' }).active).toBe(true)
    expect(query.parse({ active: 'false' }).active).toBe(false)
    expect(query.safeParse({ active: 'yes' }).success).toBe(false)
    expect(args.parse({ active: 'true' }).active).toBe(true)
    expect(args.parse({ active: 'false' }).active).toBe(false)
    expect(args.safeParse({ active: 'yes' }).success).toBe(false)
    expect(defaulted.parse({}).active).toBe(false)
    expect(defaulted.parse({ active: 'true' }).active).toBe(true)
    expect(defaulted.safeParse({ active: 'yes' }).success).toBe(false)
  })

  test('boolean enum query options parse as flags', async () => {
    const commands = await Openapi.generateCommands(
      {
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              parameters: [
                {
                  name: 'active',
                  in: 'query',
                  schema: { type: 'boolean', enum: [true, false] },
                },
              ],
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      },
      app.fetch,
    )
    const options = command(commands, 'listUsers').options!
    const help = Help.formatCommand('api listUsers', { options })
    const candidates = Completions.complete(
      new Map([['status', { description: 'Status' }]]),
      { options },
      ['api', '--active', ''],
      2,
    )

    expect(help).toContain('--active')
    expect(help).not.toContain('--active <')
    expect(candidates.map((c) => c.value)).toContain('status')
    expect(Parser.parse(['--active'], { options }).options).toEqual({ active: true })
    expect(Parser.parse(['--no-active'], { options }).options).toEqual({ active: false })
    expect(Parser.parse(['--active=false'], { options }).options).toEqual({ active: false })
    expect(options.safeParse({ active: 'yes' }).success).toBe(false)
  })

  test('single-value boolean enum query options do not parse as general flags', async () => {
    const commands = await Openapi.generateCommands(
      {
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              parameters: [
                {
                  name: 'active',
                  in: 'query',
                  schema: { type: 'boolean', enum: [true] },
                },
              ],
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      },
      app.fetch,
    )
    const options = command(commands, 'listUsers').options!

    expect(() => Parser.parse(['--active'], { options })).toThrow(
      'Missing value for flag: --active',
    )
    expect(() => Parser.parse(['--no-active'], { options })).toThrow(
      'Flag does not support negation: --no-active',
    )
  })

  test('mixed literal enum query options do not collapse to booleans', async () => {
    const commands = await Openapi.generateCommands(
      {
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              parameters: [
                {
                  name: 'active',
                  in: 'query',
                  schema: { enum: [true, false, 'auto'] },
                },
              ],
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      },
      app.fetch,
    )
    const options = command(commands, 'listUsers').options!

    expect(options.parse({ active: 'auto' }).active).toBe('auto')
    expect(Parser.parse(['--active', 'auto'], { options }).options).toEqual({ active: 'auto' })
    expect(() => Parser.parse(['--active'], { options })).toThrow(
      'Missing value for flag: --active',
    )
  })

  test('boolean query options are rendered as boolean flags in help', async () => {
    const commands = await Openapi.generateCommands(
      {
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              parameters: [{ name: 'active', in: 'query', schema: { type: 'boolean' } }],
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      },
      app.fetch,
    )

    const output = Help.formatCommand('api listUsers', {
      options: command(commands, 'listUsers').options,
    })

    expect(output).toContain('--active')
    expect(output).not.toContain('--active <')
  })

  test('boolean query options do not consume the next completion word', async () => {
    const commands = await Openapi.generateCommands(
      {
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              parameters: [{ name: 'active', in: 'query', schema: { type: 'boolean' } }],
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      },
      app.fetch,
    )
    const root = { options: command(commands, 'listUsers').options }
    const candidates = Completions.complete(
      new Map([['status', { description: 'Status' }]]),
      root,
      ['api', '--active', ''],
      2,
    )

    expect(candidates.map((c) => c.value)).toContain('status')
  })

  test('generated boolean query options parse as flags without marker metadata', async () => {
    const commands = await Openapi.generateCommands(
      {
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              parameters: [{ name: 'active', in: 'query', schema: { type: 'boolean' } }],
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      },
      app.fetch,
    )
    const options = command(commands, 'listUsers').options!

    expect(Parser.parse(['--active'], { options }).options).toEqual({ active: true })
    expect(Parser.parse(['--no-active'], { options }).options).toEqual({ active: false })
    expect(Parser.parse(['--active=false'], { options }).options).toEqual({ active: false })

    const jsonSchema = Schema.toJsonSchema(options)
    expect(jsonSchema).toEqual({
      type: 'object',
      properties: { active: { type: 'boolean' } },
      additionalProperties: false,
    })
    expect(JSON.stringify(jsonSchema)).not.toContain('openapiStrictBoolean')
  })
})

describe('cli integration', () => {
  function createCli() {
    return Cli.create('test', { description: 'test' }).command('api', {
      fetch: app.fetch,
      openapi: spec,
    })
  }

  test('GET /users via operationId', async () => {
    const { output } = await serve(createCli(), ['api', 'listUsers'])
    expect(output).toContain('Alice')
  })

  test('GET /users via namespace', async () => {
    const cli = Cli.create('test', { description: 'test' }).command('api', {
      fetch: app.fetch,
      openapi: spec,
      openapiConfig: { mode: 'namespace' },
    })
    const { output } = await serve(cli, ['api', 'users', 'get', '--limit', '5', '--format', 'json'])
    expect(json(output).limit).toMatchInlineSnapshot(`5`)
  })

  test('GET /users?limit=5 via options', async () => {
    const { output } = await serve(createCli(), [
      'api',
      'listUsers',
      '--limit',
      '5',
      '--format',
      'json',
    ])
    expect(json(output).limit).toBe(5)
  })

  test('loads OpenAPI commands from a spec URL string', async () => {
    const cli = Cli.create('test', { description: 'test' }).command('api', {
      fetch: app.fetch,
      openapi: openapiUrl(),
    })
    const { output } = await serve(cli, ['api', 'listUsers'])
    expect(output).toContain('Alice')
  })

  test('loads OpenAPI commands from a spec URL object', async () => {
    const cli = Cli.create('test', { description: 'test' }).command('api', {
      fetch: app.fetch,
      openapi: new URL(openapiUrl()),
    })
    const { output } = await serve(cli, ['api', 'listUsers'])
    expect(output).toContain('Alice')
  })

  test('generates root commands from hosted fetch and OpenAPI URLs', async () => {
    const fetch = hostedApiFetch()
    const cli = Cli.create('test', {
      description: 'test',
      fetch: Fetch.fromRequest('https://api.example.com/api'),
      openapi: 'openapi.json',
    })

    try {
      const { output } = await serve(cli, ['listUsers', '--limit', '5', '--format', 'json'])
      expect(json(output).limit).toBe(5)
    } finally {
      fetch.mockRestore()
    }
  })

  test('GET /users/:id via positional arg', async () => {
    const { output } = await serve(createCli(), ['api', 'getUser', '42'])
    expect(output).toMatchInlineSnapshot(`
      "id: 42
      name: Alice
      "
    `)
  })

  test('POST /users via createUser with body options', async () => {
    const { output } = await serve(createCli(), ['api', 'createUser', '--name', 'Bob'])
    expect(output).toMatchInlineSnapshot(`
      "created: true
      name: Bob
      "
    `)
  })

  test('DELETE /users/:id via deleteUser', async () => {
    const { output } = await serve(createCli(), ['api', 'deleteUser', '1'])
    expect(output).toMatchInlineSnapshot(`
      "deleted: true
      id: 1
      "
    `)
  })

  test('GET /health via healthCheck', async () => {
    const { output } = await serve(createCli(), ['api', 'healthCheck'])
    expect(output).toMatchInlineSnapshot(`
      "ok: true
      "
    `)
  })

  test('--help on api shows subcommands', async () => {
    const { output } = await serve(createCli(), ['api', '--help'])
    expect(output).toContain('listUsers')
    expect(output).toContain('createUser')
    expect(output).toContain('getUser')
    expect(output).toContain('deleteUser')
    expect(output).toContain('healthCheck')
  })

  test('--help on specific command shows typed args/options', async () => {
    const { output } = await serve(createCli(), ['api', 'getUser', '--help'])
    expect(output).toContain('id')
    expect(output).toContain('Get a user by ID')
  })

  test('--help on createUser shows body options', async () => {
    const { output } = await serve(createCli(), ['api', 'createUser', '--help'])
    expect(output).toContain('name')
    expect(output).toContain('Create a user')
  })

  test('--format json', async () => {
    const { output } = await serve(createCli(), ['api', 'healthCheck', '--format', 'json'])
    expect(json(output)).toEqual({ ok: true })
  })

  test('--full-output wraps in envelope', async () => {
    const { output } = await serve(createCli(), [
      'api',
      'healthCheck',
      '--full-output',
      '--format',
      'json',
    ])
    const parsed = json(output)
    expect(parsed.ok).toBe(true)
    expect(parsed.data).toEqual({ ok: true })
    expect(parsed.meta.command).toContain('api')
  })

  test('missing required path param shows validation error', async () => {
    const { exitCode } = await serve(createCli(), ['api', 'getUser'])
    expect(exitCode).toBe(1)
  })

  test('generated OpenAPI boolean query option behaves like a CLI flag', async () => {
    const createCli = () =>
      Cli.create('test', { description: 'test' }).command('api', {
        fetch(req) {
          const active = new URL(req.url).searchParams.get('active')
          return Response.json({ active: active === null ? null : active === 'true' })
        },
        openapi: {
          paths: {
            '/users': {
              get: {
                operationId: 'listUsers',
                parameters: [
                  {
                    name: 'active',
                    in: 'query',
                    schema: { type: 'boolean' },
                  },
                ],
                responses: { '200': { description: 'ok' } },
              },
            },
            '/defaulted': {
              get: {
                operationId: 'listDefaulted',
                parameters: [
                  {
                    name: 'active',
                    in: 'query',
                    schema: { type: 'boolean', default: false },
                  },
                ],
                responses: { '200': { description: 'ok' } },
              },
            },
          },
        },
      })

    expect(
      json((await serve(createCli(), ['api', 'listUsers', '--active', '--format', 'json'])).output),
    ).toEqual({ active: true })
    expect(
      json(
        (await serve(createCli(), ['api', 'listUsers', '--no-active', '--format', 'json'])).output,
      ),
    ).toEqual({ active: false })
    expect(
      json(
        (await serve(createCli(), ['api', 'listUsers', '--active=false', '--format', 'json']))
          .output,
      ),
    ).toEqual({ active: false })
    expect((await serve(createCli(), ['api', 'listUsers', '--active=yes'])).exitCode).toBe(1)
    expect((await serve(createCli(), ['api', 'listDefaulted', '--active=yes'])).exitCode).toBe(1)
  })

  test('generated OpenAPI boolean body option rejects non-boolean strings', async () => {
    const createCli = () =>
      Cli.create('test', { description: 'test' }).command('api', {
        async fetch(req) {
          return Response.json(await req.json())
        },
        openapi: {
          paths: {
            '/users': {
              post: {
                operationId: 'createUser',
                requestBody: {
                  required: true,
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          active: { type: 'boolean', default: false },
                        },
                      },
                    },
                  },
                },
                responses: { '200': { description: 'ok' } },
              },
            },
          },
        },
      })

    expect(
      json(
        (await serve(createCli(), ['api', 'createUser', '--active', '--format', 'json'])).output,
      ),
    ).toEqual({ active: true })
    expect((await serve(createCli(), ['api', 'createUser', '--active=yes'])).exitCode).toBe(1)
  })

  test('generated path params follow path-template order in help and CLI parsing', async () => {
    const cli = Cli.create('test', { description: 'test' }).command('api', {
      fetch(req) {
        return Response.json({ path: new URL(req.url).pathname })
      },
      openapi: {
        paths: {
          '/users/{userId}/repos/{repoId}': {
            get: {
              operationId: 'getRepo',
              parameters: [
                { name: 'repoId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
              ],
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      },
    })

    expect((await serve(cli, ['api', 'getRepo', '--help'])).output).toContain(
      'Usage: test api getRepo <userId> <repoId>',
    )
    expect(
      json((await serve(cli, ['api', 'getRepo', 'alice', 'toolkit', '--format', 'json'])).output),
    ).toEqual({ path: '/users/alice/repos/toolkit' })
  })
})

describe('@hono/zod-openapi integration', () => {
  function createCli() {
    return Cli.create('test', { description: 'test' }).command('api', {
      fetch: openapiApp.fetch,
      openapi: openapiSpec,
    })
  }

  test('GET /users via listUsers', async () => {
    const { output } = await serve(createCli(), ['api', 'listUsers'])
    expect(output).toContain('Alice')
  })

  test('GET /users?limit=5', async () => {
    const { output } = await serve(createCli(), [
      'api',
      'listUsers',
      '--limit',
      '5',
      '--format',
      'json',
    ])
    expect(json(output).limit).toBe(5)
  })

  test('GET /users/:id via getUser', async () => {
    const { output } = await serve(createCli(), ['api', 'getUser', '42'])
    expect(output).toMatchInlineSnapshot(`
      "id: 42
      name: Alice
      "
    `)
  })

  test('POST /users via createUser', async () => {
    const { output } = await serve(createCli(), ['api', 'createUser', '--name', 'Bob'])
    expect(output).toMatchInlineSnapshot(`
      "created: true
      name: Bob
      "
    `)
  })

  test('DELETE /users/:id via deleteUser', async () => {
    const { output } = await serve(createCli(), ['api', 'deleteUser', '1'])
    expect(output).toMatchInlineSnapshot(`
      "deleted: true
      id: 1
      "
    `)
  })

  test('GET /health via healthCheck', async () => {
    const { output } = await serve(createCli(), ['api', 'healthCheck'])
    expect(output).toMatchInlineSnapshot(`
      "ok: true
      "
    `)
  })

  test('--help shows operationId commands', async () => {
    const { output } = await serve(createCli(), ['api', '--help'])
    expect(output).toContain('listUsers')
    expect(output).toContain('getUser')
    expect(output).toContain('createUser')
    expect(output).toContain('deleteUser')
    expect(output).toContain('healthCheck')
    expect(output).toContain('updateUser')
  })

  test('--help on getUser shows path param', async () => {
    const { output } = await serve(createCli(), ['api', 'getUser', '--help'])
    expect(output).toContain('id')
  })

  test('--help on createUser shows body options', async () => {
    const { output } = await serve(createCli(), ['api', 'createUser', '--help'])
    expect(output).toContain('name')
  })

  test('--help on updateUser shows path param and body options', async () => {
    const { output } = await serve(createCli(), ['api', 'updateUser', '--help'])
    expect(output).toContain('id')
    expect(output).toContain('name')
    expect(output).toContain('Update a user')
  })

  test('--format json', async () => {
    const { output } = await serve(createCli(), ['api', 'healthCheck', '--format', 'json'])
    expect(json(output)).toEqual({ ok: true })
  })

  test('--full-output wraps in envelope', async () => {
    const { output } = await serve(createCli(), [
      'api',
      'healthCheck',
      '--full-output',
      '--format',
      'json',
    ])
    const parsed = json(output)
    expect(parsed.ok).toBe(true)
    expect(parsed.data).toEqual({ ok: true })
    expect(parsed.meta.command).toContain('api')
  })

  test('missing required path param shows validation error', async () => {
    const { exitCode } = await serve(createCli(), ['api', 'getUser'])
    expect(exitCode).toBe(1)
  })

  test('PUT /users/:id with path param + body options', async () => {
    const { output } = await serve(createCli(), ['api', 'updateUser', '1', '--name', 'Updated'])
    expect(output).toMatchInlineSnapshot(`
      "id: 1
      name: Updated
      "
    `)
  })

  test('PUT /users/:id with optional boolean body option', async () => {
    const { output } = await serve(createCli(), [
      'api',
      'updateUser',
      '1',
      '--name',
      'Updated',
      '--active',
      'true',
      '--format',
      'json',
    ])
    const parsed = json(output)
    expect(parsed.id).toBe(1)
    expect(parsed.name).toBe('Updated')
    expect(parsed.active).toBe(true)
  })

  test('query param coercion with zod-openapi generated spec', async () => {
    const { output } = await serve(createCli(), [
      'api',
      'listUsers',
      '--limit',
      '3',
      '--format',
      'json',
    ])
    expect(json(output).limit).toBe(3)
  })
})

describe('basePath', () => {
  test('fetch gateway prepends basePath to request path', async () => {
    const cli = Cli.create('test', { description: 'test' }).command('api', {
      fetch: prefixedApp.fetch,
      basePath: '/api',
    })
    const { output } = await serve(cli, ['api', 'users'])
    expect(output).toContain('Alice')
  })

  test('fetch gateway basePath with query params', async () => {
    const cli = Cli.create('test', { description: 'test' }).command('api', {
      fetch: prefixedApp.fetch,
      basePath: '/api',
    })
    const { output } = await serve(cli, ['api', 'users', '--limit', '5', '--format', 'json'])
    expect(json(output).limit).toBe(5)
  })

  test('fetch gateway basePath with POST', async () => {
    const cli = Cli.create('test', { description: 'test' }).command('api', {
      fetch: prefixedApp.fetch,
      basePath: '/api',
    })
    const { output } = await serve(cli, ['api', 'users', '-X', 'POST', '-d', '{"name":"Bob"}'])
    expect(output).toContain('Bob')
    expect(output).toContain('created')
  })

  test('openapi with basePath prepends to spec paths', async () => {
    const cli = Cli.create('test', { description: 'test' }).command('api', {
      fetch: prefixedApp.fetch,
      openapi: spec,
      basePath: '/api',
    })
    const { output } = await serve(cli, ['api', 'listUsers'])
    expect(output).toContain('Alice')
  })

  test('openapi basePath with path params', async () => {
    const cli = Cli.create('test', { description: 'test' }).command('api', {
      fetch: prefixedApp.fetch,
      openapi: spec,
      basePath: '/api',
    })
    const { output } = await serve(cli, ['api', 'getUser', '42'])
    expect(output).toMatchInlineSnapshot(`
      "id: 42
      name: Alice
      "
    `)
  })

  test('openapi basePath with body options', async () => {
    const cli = Cli.create('test', { description: 'test' }).command('api', {
      fetch: prefixedApp.fetch,
      openapi: spec,
      basePath: '/api',
    })
    const { output } = await serve(cli, ['api', 'createUser', '--name', 'Bob'])
    expect(output).toContain('created')
    expect(output).toContain('Bob')
  })

  test('openapi basePath with health check', async () => {
    const cli = Cli.create('test', { description: 'test' }).command('api', {
      fetch: prefixedApp.fetch,
      openapi: spec,
      basePath: '/api',
    })
    const { output } = await serve(cli, ['api', 'healthCheck', '--format', 'json'])
    expect(json(output)).toEqual({ ok: true })
  })
})
