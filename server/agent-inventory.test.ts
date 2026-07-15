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
})
