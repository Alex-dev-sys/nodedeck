import { describe, expect, it } from 'vitest'
import { buildAgentInstallCommand } from './agentInstall'

describe('buildAgentInstallCommand', () => {
  it('installs from any working directory and targets the cloud control plane', () => {
    const command = buildAgentInstallCommand('enrollment-token', 'https://nodedeck.example/')

    expect(command).toContain('mktemp -d')
    expect(command).toContain('Alex-dev-sys/nodedeck/archive/refs/heads/main.tar.gz')
    expect(command).toContain("'https://nodedeck.example/agent/v1/enroll'")
    expect(command).toContain("SERVER_OS_CONTROL_URL='https://nodedeck.example'")
    expect(command).toContain('"$NODEDECK_DIR/scripts/install-agent.sh"')
    expect(command).not.toContain(' ./scripts/install-agent.sh')
    expect(command).not.toContain('Docker CLI is required')
  })

  it('quotes enrollment values before placing them in a shell command', () => {
    const command = buildAgentInstallCommand("token'with-quote", 'https://nodedeck.example')

    expect(command).toContain(`ENROLLMENT_TOKEN='token'"'"'with-quote'`)
  })
})
