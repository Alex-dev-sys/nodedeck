import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []
const heartbeatScript = fileURLToPath(new URL('../scripts/agent-heartbeat.sh', import.meta.url))

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function executable(directory: string, name: string, body: string) {
  const path = join(directory, name)
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
  return path
}

function payloadHelper(directory: string) {
  return executable(directory, 'agent-http', `
while [ "$#" -gt 0 ]; do
  if [ "$1" = --data ]; then shift; printf '%s\\n' "$1"; exit 0; fi
  shift
done
exit 1`)
}

describe('agent host CPU metrics', () => {
  it('reports total Linux host utilization from /proc/stat instead of summing processes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'nodedeck-heartbeat-linux-'))
    temporaryDirectories.push(directory)
    const procStat = join(directory, 'stat')
    writeFileSync(procStat, 'cpu  100 0 100 700 0 0 0 0 0 0\n')
    executable(directory, 'sleep', `printf '%s\\n' 'cpu  110 0 110 780 0 0 0 0 0 0' > '${procStat}'`)
    const helper = payloadHelper(directory)

    const result = spawnSync(heartbeatScript, [], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH ?? ''}`,
        SERVER_OS_AGENT_TOKEN: 'test-token',
        SERVER_OS_AGENT_HTTP_HELPER: helper,
        SERVER_OS_PROC_STAT_PATH: procStat,
        SERVER_OS_CPU_SAMPLE_SECONDS: '0',
        SERVER_OS_HEARTBEAT_ONCE: 'true',
      },
    })

    expect(result.status, result.stderr).toBe(0)
    const payload = JSON.parse(result.stdout.trim().split('\n').at(-1)!) as { host: { cpu: number } }
    expect(payload.host.cpu).toBe(20)
  })

  it('normalizes the process fallback by the number of CPU cores', () => {
    const directory = mkdtempSync(join(tmpdir(), 'nodedeck-heartbeat-fallback-'))
    temporaryDirectories.push(directory)
    executable(directory, 'uname', `printf '%s\\n' Linux`)
    executable(directory, 'ps', `printf '%s\\n' 100 60`)
    executable(directory, 'getconf', `printf '%s\\n' 4`)
    const helper = payloadHelper(directory)

    const result = spawnSync(heartbeatScript, [], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH ?? ''}`,
        SERVER_OS_AGENT_TOKEN: 'test-token',
        SERVER_OS_AGENT_HTTP_HELPER: helper,
        SERVER_OS_PROC_STAT_PATH: join(directory, 'missing-stat'),
        SERVER_OS_HEARTBEAT_ONCE: 'true',
      },
    })

    expect(result.status, result.stderr).toBe(0)
    const payload = JSON.parse(result.stdout.trim().split('\n').at(-1)!) as { host: { cpu: number } }
    expect(payload.host.cpu).toBe(40)
  })
})
