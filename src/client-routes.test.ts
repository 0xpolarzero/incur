import { describe, expect, test } from 'vitest'

import * as Cli from './Cli.js'

async function json(response: Response) {
  return response.json() as Promise<any>
}

describe('client HTTP routes', () => {
  test('maps RPC protocol failures to precise HTTP statuses', async () => {
    const cli = Cli.create('app').command(
      Cli.create('group').command('leaf', {
        run() {
          return null
        },
      }),
    )
    cli.command('raw', { fetch: () => new Response('{}') })

    const invalid = await cli.fetch(
      new Request('http://localhost/_incur/rpc', {
        method: 'POST',
        body: JSON.stringify({ command: '' }),
      }),
    )
    expect(invalid.status).toBe(400)
    expect(await json(invalid)).toMatchObject({ error: { code: 'INVALID_RPC_REQUEST' } })

    const group = await cli.fetch(
      new Request('http://localhost/_incur/rpc', {
        method: 'POST',
        body: JSON.stringify({ command: 'group' }),
      }),
    )
    expect(group.status).toBe(400)
    expect(await json(group)).toMatchObject({ error: { code: 'COMMAND_GROUP' } })

    const raw = await cli.fetch(
      new Request('http://localhost/_incur/rpc', {
        method: 'POST',
        body: JSON.stringify({ command: 'raw' }),
      }),
    )
    expect(raw.status).toBe(400)
    expect(await json(raw)).toMatchObject({ error: { code: 'FETCH_GATEWAY' } })

    const missing = await cli.fetch(
      new Request('http://localhost/_incur/rpc', {
        method: 'POST',
        body: JSON.stringify({ command: 'missing' }),
      }),
    )
    expect(missing.status).toBe(404)
    expect(await json(missing)).toMatchObject({ error: { code: 'COMMAND_NOT_FOUND' } })
  })

  test('maps discovery failures to precise envelopes', async () => {
    const cli = Cli.create('app').command('status', {
      run() {
        return { ok: true }
      },
    })

    const unknownCommand = await cli.fetch(
      new Request('http://localhost/_incur/help?command=missing'),
    )
    expect(unknownCommand.status).toBe(404)
    expect(await json(unknownCommand)).toMatchObject({
      error: { code: 'COMMAND_NOT_FOUND' },
      meta: { resource: 'help' },
    })

    const unsafeSkill = await cli.fetch(new Request('http://localhost/_incur/skill?name=../x'))
    expect(unsafeSkill.status).toBe(400)
    expect(await json(unsafeSkill)).toMatchObject({ error: { code: 'INVALID_SKILL_NAME' } })

    const unknownSkill = await cli.fetch(new Request('http://localhost/_incur/skill?name=missing'))
    expect(unknownSkill.status).toBe(404)
    expect(await json(unknownSkill)).toMatchObject({ error: { code: 'SKILL_NOT_FOUND' } })
  })
})
