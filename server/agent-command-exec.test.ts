import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []
const commandScript = fileURLToPath(new URL('../scripts/agent-command-exec.sh', import.meta.url))

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function fakeCommand(directory: string, name: string, body: string) {
  const path = join(directory, name)
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
}

function run(directory: string, action: string, kind: string, resourceKey: string, environment: Record<string, string> = {}) {
  return spawnSync(commandScript, [action, kind, resourceKey], {
    encoding: 'utf8',
    env: { ...process.env, ...environment, PATH: `${directory}:${process.env.PATH ?? ''}` },
  })
}

describe('agent command executor', () => {
  it('controls every container in a Compose project as one service', () => {
    const directory = mkdtempSync(join(tmpdir(), 'nodedeck-command-'))
    temporaryDirectories.push(directory)
    fakeCommand(directory, 'docker', `
case "$1" in
  info) exit 0 ;;
  ps) printf '%s\\n' c1 c2 ;;
  inspect) printf '%s\\n' '[
    {"Id":"c1","Config":{"Labels":{"com.docker.compose.project":"shop"}},"State":{"Status":"running","Health":{"Status":"healthy"}}},
    {"Id":"c2","Config":{"Labels":{"com.docker.compose.project":"shop"}},"State":{"Status":"running","Health":{"Status":"healthy"}}}
  ]' ;;
  restart) printf '%s\\n' "$2" "$3" ;;
  *) exit 1 ;;
esac`)

    const result = run(directory, 'restart', 'docker', 'docker-compose:shop')

    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ observedState: '2/2 running', healthStatus: 'healthy' })
  })

  it('controls user systemd services but rejects system services', () => {
    const directory = mkdtempSync(join(tmpdir(), 'nodedeck-systemd-command-'))
    temporaryDirectories.push(directory)
    fakeCommand(directory, 'systemctl', `
if [ "$1" = --user ] && [ "$2" = is-active ]; then printf '%s\\n' active; exit 0; fi
exit 0`)

    const userResult = run(directory, 'restart', 'systemd', 'systemd-user:telegram-bot.service')
    const systemResult = run(directory, 'restart', 'systemd', 'systemd-system:sshd.service')

    expect(userResult.status, userResult.stderr).toBe(0)
    expect(JSON.parse(userResult.stdout)).toMatchObject({ observedState: 'active' })
    expect(systemResult.status).toBe(1)
    expect(JSON.parse(systemResult.stdout).message).toContain('administrator permission')
  })

  it('controls a PM2 process by numeric id', () => {
    const directory = mkdtempSync(join(tmpdir(), 'nodedeck-pm2-command-'))
    temporaryDirectories.push(directory)
    fakeCommand(directory, 'pm2', `
if [ "$1" = jlist ]; then printf '%s\\n' '[{"pm_id":7,"pm2_env":{"status":"online"}}]'; exit 0; fi
exit 0`)

    const result = run(directory, 'start', 'pm2', 'pm2:7')

    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ observedState: 'online' })
  })

  it('starts and stops a user LaunchAgent using only its matching plist', () => {
    const directory = mkdtempSync(join(tmpdir(), 'nodedeck-launchd-command-'))
    temporaryDirectories.push(directory)
    const launchAgents = join(directory, 'Library', 'LaunchAgents')
    mkdirSync(launchAgents, { recursive: true })
    writeFileSync(join(launchAgents, 'com.example.worker.plist'), '<plist/>')
    const state = join(directory, 'launchd-running')
    fakeCommand(directory, 'uname', 'printf %s Darwin')
    fakeCommand(directory, 'id', 'printf %s 501')
    fakeCommand(directory, 'plutil', 'printf %s com.example.worker')
    fakeCommand(directory, 'sleep', 'exit 0')
    fakeCommand(directory, 'launchctl', `
case "$1" in
  print) [ -f "${state}" ] ;;
  bootstrap|kickstart) touch "${state}" ;;
  bootout) rm -f "${state}" ;;
  *) exit 1 ;;
esac`)

    const started = run(directory, 'start', 'launchd', 'launchd-user:com.example.worker', { HOME: directory })
    const stopped = run(directory, 'stop', 'launchd', 'launchd-user:com.example.worker', { HOME: directory })

    expect(started.status, started.stderr).toBe(0)
    expect(JSON.parse(started.stdout)).toMatchObject({ observedState: 'running' })
    expect(stopped.status, stopped.stderr).toBe(0)
    expect(JSON.parse(stopped.stdout)).toMatchObject({ observedState: 'stopped' })
  }, 10_000)
})
