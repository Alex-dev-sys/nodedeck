import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []
const httpScript = fileURLToPath(new URL('../scripts/agent-http.sh', import.meta.url))

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('agent HTTP transport', () => {
  it('keeps the agent credential out of curl arguments and removes its temporary config', () => {
    const directory = mkdtempSync(join(tmpdir(), 'nodedeck-http-'))
    temporaryDirectories.push(directory)
    const curl = join(directory, 'curl')
    writeFileSync(curl, `#!/bin/sh
config=
while [ "$#" -gt 0 ]; do
  if [ "$1" = --config ]; then config=$2; shift 2; continue; fi
  printf '%s\\n' "$1"
  shift
done
printf 'CONFIG=%s\\n' "$config"
`)
    chmodSync(curl, 0o755)
    const token = 'agent-token-that-must-not-appear-in-process-args'

    const result = spawnSync(httpScript, ['--request', 'POST', 'http://127.0.0.1:8081/agent/v1/heartbeat'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH ?? ''}`,
        SERVER_OS_AGENT_TOKEN: token,
        SERVER_OS_CONTROL_URL: 'http://127.0.0.1:8081',
      },
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).not.toContain(token)
    const configPath = result.stdout.match(/^CONFIG=(.+)$/m)?.[1]
    expect(configPath).toBeTruthy()
    expect(existsSync(configPath!)).toBe(false)
  })

  it('refuses plaintext transport to a remote control plane', () => {
    const result = spawnSync(httpScript, ['https://nodedeck.example/agent/v1/heartbeat'], {
      encoding: 'utf8',
      env: { ...process.env, SERVER_OS_AGENT_TOKEN: 'test-token', SERVER_OS_CONTROL_URL: 'http://example.com' },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('requires HTTPS')
  })
})
