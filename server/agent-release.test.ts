import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const installer = readFileSync(fileURLToPath(new URL('../public/install-agent.sh', import.meta.url)), 'utf8')
const updater = readFileSync(fileURLToPath(new URL('../public/update-agent.sh', import.meta.url)), 'utf8')

describe('public agent release scripts', () => {
  it('pin installation and updates to the same immutable Git commit', () => {
    const installRef = installer.match(/^AGENT_RELEASE_REF=([a-f0-9]{40})$/m)?.[1]
    const updateRef = updater.match(/^AGENT_RELEASE_REF=([a-f0-9]{40})$/m)?.[1]
    expect(installRef).toMatch(/^[a-f0-9]{40}$/)
    expect(updateRef).toBe(installRef)
    expect(updater).toContain('scripts/update-agent.sh')
  })
})
