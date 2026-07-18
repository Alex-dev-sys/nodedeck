import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []
const inventoryScript = fileURLToPath(new URL('../scripts/agent-inventory.sh', import.meta.url))

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('agent inventory', () => {
  it('groups containers with the same project key into one logical project', () => {
    const directory = mkdtempSync(join(tmpdir(), 'nodedeck-inventory-'))
    temporaryDirectories.push(directory)
    const docker = join(directory, 'docker')
    writeFileSync(docker, `#!/bin/sh
case "$1" in
  info) exit 0 ;;
  stats)
    printf '%s\\n' '{"ID":"c1","CPUPerc":"10%","MemPerc":"20%"}' '{"ID":"c2","CPUPerc":"15%","MemPerc":"25%"}'
    ;;
  ps) printf '%s\\n' c1 c2 ;;
  inspect)
    printf '%s\\n' '[
      {"Id":"c1","Name":"/infra-api","Config":{"Image":"infra-api:latest","Labels":{"com.docker.compose.project":"server-os-stage2","com.docker.compose.service":"api"}},"State":{"Status":"running","Running":true,"StartedAt":"2026-07-15T20:00:00Z","Health":{"Status":"healthy"}},"RestartCount":1,"NetworkSettings":{"Ports":{}}},
      {"Id":"c2","Name":"/infra-web","Config":{"Image":"infra-web:latest","Labels":{"com.docker.compose.project":"infra-dashboard-release-smoke","com.docker.compose.service":"web"}},"State":{"Status":"running","Running":true,"StartedAt":"2026-07-15T20:00:00Z","Health":{"Status":"healthy"}},"RestartCount":2,"NetworkSettings":{"Ports":{}}}
    ]'
    ;;
  *) exit 1 ;;
esac
`)
    chmodSync(docker, 0o755)

    const result = spawnSync(inventoryScript, [], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: directory,
        PATH: `${directory}:${process.env.PATH ?? ''}`,
        SERVER_OS_AGENT_TOKEN: 'test-token',
        SERVER_OS_INVENTORY_DRY_RUN: 'true',
      },
    })

    expect(result.status, result.stderr).toBe(0)
    const payload = JSON.parse(result.stdout) as { services: Array<Record<string, unknown>> }
    const dockerProjects = payload.services.filter((service) => service.kind === 'docker')
    expect(dockerProjects).toEqual([
      expect.objectContaining({
        id: 'docker-compose:infra-dashboard',
        name: 'Infra Dashboard',
        image: '2 containers',
        status: 'healthy',
        cpu: 25,
        ram: 45,
        restartCount: 3,
        protected: true,
      }),
    ])
  })

  it('discovers custom systemd units and PM2 processes without Docker', () => {
    const directory = mkdtempSync(join(tmpdir(), 'nodedeck-native-inventory-'))
    temporaryDirectories.push(directory)
    const unitDirectory = join(directory, '.config', 'systemd', 'user')
    mkdirSync(unitDirectory, { recursive: true })
    writeFileSync(join(unitDirectory, 'telegram-bot.service'), '[Service]\nExecStart=/usr/bin/node bot.js\n')

    const docker = join(directory, 'docker')
    writeFileSync(docker, '#!/bin/sh\nexit 1\n')
    chmodSync(docker, 0o755)

    const systemctl = join(directory, 'systemctl')
    writeFileSync(systemctl, `#!/bin/sh
printf '%s\\n' 'Description=Telegram Bot' 'ActiveState=active' 'SubState=running'
`)
    chmodSync(systemctl, 0o755)

    const pm2 = join(directory, 'pm2')
    writeFileSync(pm2, `#!/bin/sh
printf '%s\\n' '[{"pm_id":7,"name":"worker","pm2_env":{"status":"online","pm_exec_path":"/srv/worker.js","restart_time":2},"monit":{"cpu":4,"memory":1024}}]'
`)
    chmodSync(pm2, 0o755)

    const result = spawnSync(inventoryScript, [], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: directory,
        PATH: `${directory}:${process.env.PATH ?? ''}`,
        SERVER_OS_AGENT_TOKEN: 'test-token',
        SERVER_OS_INVENTORY_DRY_RUN: 'true',
      },
    })

    expect(result.status, result.stderr).toBe(0)
    const payload = JSON.parse(result.stdout) as { services: Array<Record<string, unknown>> }
    expect(payload.services).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'systemd-user:telegram-bot.service', name: 'Telegram Bot', kind: 'systemd', status: 'healthy' }),
      expect.objectContaining({ id: 'pm2:7', name: 'worker', kind: 'pm2', status: 'healthy' }),
    ]))
  })

  it('does not inspect disabled Docker or native runtimes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'nodedeck-disabled-inventory-'))
    temporaryDirectories.push(directory)
    const capabilitiesFile = join(directory, 'capabilities.env')
    writeFileSync(capabilitiesFile, 'SERVER_OS_TRACK_DOCKER=false\nSERVER_OS_TRACK_NATIVE=false\n')
    const docker = join(directory, 'docker')
    writeFileSync(docker, '#!/bin/sh\nexit 99\n')
    chmodSync(docker, 0o755)

    const result = spawnSync(inventoryScript, [], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: directory,
        PATH: `${directory}:${process.env.PATH ?? ''}`,
        SERVER_OS_AGENT_TOKEN: 'test-token',
        SERVER_OS_AGENT_CAPABILITIES_FILE: capabilitiesFile,
        SERVER_OS_INVENTORY_DRY_RUN: 'true',
      },
    })

    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ services: [] })
  })

  it('discovers running macOS LaunchAgents without updater or runtime duplicates', () => {
    const directory = mkdtempSync(join(tmpdir(), 'nodedeck-launchd-inventory-'))
    temporaryDirectories.push(directory)
    const launchDirectory = join(directory, 'Library', 'LaunchAgents')
    mkdirSync(launchDirectory, { recursive: true })
    for (const label of ['ai.hermes.gateway', 'homebrew.mxcl.postgresql@16', 'com.google.updater', 'com.server-os.agent', 'pm2.user']) {
      writeFileSync(join(launchDirectory, `${label}.plist`), '<plist/>')
    }

    const docker = join(directory, 'docker')
    writeFileSync(docker, '#!/bin/sh\nexit 1\n')
    chmodSync(docker, 0o755)
    const uname = join(directory, 'uname')
    writeFileSync(uname, '#!/bin/sh\nprintf "%s\\n" Darwin\n')
    chmodSync(uname, 0o755)
    const plutil = join(directory, 'plutil')
    writeFileSync(plutil, `#!/bin/sh
last=
for argument in "$@"; do last=$argument; done
label=$(basename "$last" .plist)
case "$2" in
  Label) printf '%s\\n' "$label" ;;
  Program)
    case "$label" in
      ai.hermes.gateway) printf '%s\\n' '/Users/test/hermes' ;;
      homebrew.mxcl.postgresql@16) printf '%s\\n' '/opt/homebrew/bin/postgres' ;;
      *) exit 1 ;;
    esac
    ;;
  *) exit 1 ;;
esac
`)
    chmodSync(plutil, 0o755)
    const launchctl = join(directory, 'launchctl')
    writeFileSync(launchctl, `#!/bin/sh
case "$2" in
  *ai.hermes.gateway|*homebrew.mxcl.postgresql@16|*com.server-os.agent|*pm2.user)
    printf '%s\\n' '    state = running' '    pid = 4242'
    ;;
  *) printf '%s\\n' '    state = not running' ;;
esac
`)
    chmodSync(launchctl, 0o755)
    const ps = join(directory, 'ps')
    writeFileSync(ps, '#!/bin/sh\nprintf "%s\\n" "2.5 1.5"\n')
    chmodSync(ps, 0o755)
    const pm2 = join(directory, 'pm2')
    writeFileSync(pm2, '#!/bin/sh\nprintf "%s\\n" "[]"\n')
    chmodSync(pm2, 0o755)

    const result = spawnSync(inventoryScript, [], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: directory,
        PATH: `${directory}:${process.env.PATH ?? ''}`,
        SERVER_OS_AGENT_TOKEN: 'test-token',
        SERVER_OS_INVENTORY_DRY_RUN: 'true',
      },
    })

    expect(result.status, result.stderr).toBe(0)
    const payload = JSON.parse(result.stdout) as { services: Array<Record<string, unknown>> }
    expect(payload.services.filter((service) => service.kind === 'launchd')).toEqual([
      expect.objectContaining({ id: 'launchd-user:ai.hermes.gateway', name: 'ai.hermes.gateway', status: 'healthy', cpu: 2.5, ram: 1.5 }),
      expect.objectContaining({ id: 'launchd-user:homebrew.mxcl.postgresql@16', name: 'homebrew.mxcl.postgresql@16', status: 'healthy', cpu: 2.5, ram: 1.5 }),
    ])
  })
})
