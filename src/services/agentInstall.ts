function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

export function buildAgentInstallCommand(enrollmentToken: string, controlUrl: string) {
  const normalizedControlUrl = controlUrl.replace(/\/$/, '')
  const curl = normalizedControlUrl.startsWith('https://') ? "curl --proto '=https' --tlsv1.2 -fsSL" : 'curl -fsSL'
  return `${curl} ${shellQuote(`${normalizedControlUrl}/install-agent.sh`)} | sh -s -- ${shellQuote(enrollmentToken)} ${shellQuote(normalizedControlUrl)}`
}
