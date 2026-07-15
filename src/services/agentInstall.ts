function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

export function buildAgentInstallCommand(enrollmentToken: string, controlUrl: string) {
  const normalizedControlUrl = controlUrl.replace(/\/$/, '')
  return `curl -fsSL ${shellQuote(`${normalizedControlUrl}/install-agent.sh`)} | sh -s -- ${shellQuote(enrollmentToken)} ${shellQuote(normalizedControlUrl)}`
}
