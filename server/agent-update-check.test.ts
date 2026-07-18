import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []
const updateCheckScript = fileURLToPath(new URL('../scripts/agent-update-check.sh', import.meta.url))

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'nodedeck-auto-update-'))
  temporaryDirectories.push(directory)
  const releaseDirectory = join(directory, 'release-source')
  const scriptsDirectory = join(releaseDirectory, 'scripts')
  mkdirSync(scriptsDirectory, { recursive: true })
  const updater = join(scriptsDirectory, 'update-agent.sh')
  writeFileSync(updater, '#!/bin/sh\nset -eu\nprintf updated > "$SERVER_OS_TEST_UPDATE_MARKER"\n')
  chmodSync(updater, 0o755)
  const archive = join(directory, 'release.tar.gz')
  execFileSync('tar', ['-czf', archive, '-C', directory, 'release-source'])
  const sha256 = createHash('sha256').update(readFileSync(archive)).digest('hex')
  const curl = join(directory, 'curl')
  writeFileSync(curl, `#!/bin/sh
output=
while [ "$#" -gt 0 ]; do
  if [ "$1" = -o ]; then shift; output=$1; fi
  shift
done
cp "$SERVER_OS_TEST_ARCHIVE" "$output"
`)
  chmodSync(curl, 0o755)
  return { directory, archive, sha256 }
}

function response(sha256: string, automaticUpdates = true) {
  return JSON.stringify({
    capabilities: { automaticUpdates },
    agentRelease: {
      version: '2026.07.18.3',
      ref: 'a'.repeat(40),
      archiveUrl: 'https://downloads.example/agent.tar.gz',
      sha256,
    },
  })
}

describe('automatic agent updates', { timeout: 15_000 }, () => {
  it('installs an HTTPS release only after its SHA-256 matches', () => {
    const current = fixture()
    const marker = join(current.directory, 'updated')
    const result = spawnSync(updateCheckScript, ['2026.07.18.2', response(current.sha256)], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${current.directory}:${process.env.PATH ?? ''}`,
        SERVER_OS_AGENT_STATE_DIR: join(current.directory, 'state'),
        SERVER_OS_AGENT_UPDATE_FOREGROUND: 'true',
        SERVER_OS_TEST_ARCHIVE: current.archive,
        SERVER_OS_TEST_UPDATE_MARKER: marker,
      },
    })

    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(marker, 'utf8')).toBe('updated')
    expect(readFileSync(join(current.directory, 'state', 'update-attempt'), 'utf8')).toMatch(/^2026\.07\.18\.3 \d+\n$/)
  })

  it('rejects a release whose checksum does not match', () => {
    const current = fixture()
    const marker = join(current.directory, 'updated')
    const result = spawnSync(updateCheckScript, ['2026.07.18.2', response('0'.repeat(64))], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${current.directory}:${process.env.PATH ?? ''}`,
        SERVER_OS_AGENT_STATE_DIR: join(current.directory, 'state'),
        SERVER_OS_AGENT_UPDATE_FOREGROUND: 'true',
        SERVER_OS_TEST_ARCHIVE: current.archive,
        SERVER_OS_TEST_UPDATE_MARKER: marker,
      },
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stderr).toContain('SHA-256 mismatch')
    expect(() => readFileSync(marker)).toThrow()
  })

  it('does not download when automatic updates are disabled', () => {
    const current = fixture()
    const marker = join(current.directory, 'updated')
    const result = spawnSync(updateCheckScript, ['2026.07.18.2', response(current.sha256, false)], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${current.directory}:${process.env.PATH ?? ''}`,
        SERVER_OS_AGENT_STATE_DIR: join(current.directory, 'state'),
        SERVER_OS_AGENT_UPDATE_FOREGROUND: 'true',
        SERVER_OS_TEST_ARCHIVE: current.archive,
        SERVER_OS_TEST_UPDATE_MARKER: marker,
      },
    })

    expect(result.status, result.stderr).toBe(0)
    expect(() => readFileSync(marker)).toThrow()
  })
})
