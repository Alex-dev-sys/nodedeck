import { describe, expect, it } from 'vitest'
import { buildAgentInstallCommand } from './agentInstall'

describe('buildAgentInstallCommand', () => {
  it('returns one copy-paste line targeting the cloud control plane', () => {
    const command = buildAgentInstallCommand('enrollment-token', 'https://nodedeck.example/')

    expect(command).toBe("curl --proto '=https' --tlsv1.2 -fsSL 'https://nodedeck.example/install-agent.sh' | sh -s -- 'enrollment-token' 'https://nodedeck.example'")
    expect(command).not.toContain('\n')
  })

  it('quotes enrollment values before placing them in a shell command', () => {
    const command = buildAgentInstallCommand("token'with-quote", 'https://nodedeck.example')

    expect(command).toContain(`'token'"'"'with-quote'`)
  })
})
