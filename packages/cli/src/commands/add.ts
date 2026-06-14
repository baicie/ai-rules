import type { AgentName, AirulesConfig } from '@baicie/airules-schema'
import {
  installPack,
  loadAirulesConfigSync,
  upsertConfigPack,
  validateSourceSecurity,
  writeAirulesConfig,
} from '@baicie/airules-core'

export interface AddCommandOptions {
  cwd: string
  source: string
  profile?: string
  agent?: string
  dryRun?: boolean
  save?: boolean
}

export function runAddCommand(options: AddCommandOptions): void {
  const agents = parseAgentList(options.agent)
  const config = loadConfigOrCreateEmpty(options.cwd)
  const securityResult = validateSourceSecurity(options.source, config.security)

  for (const warning of securityResult.warnings) {
    console.warn(`warning: ${warning}`)
  }

  installPack({
    cwd: options.cwd,
    source: options.source,
    profile: options.profile,
    agents,
    dryRun: options.dryRun === true,
  }).then(
    result => {
      printInstallSummary(result.operations, options.dryRun === true)

      if (options.dryRun === true || options.save === false) {
        return
      }

      const nextConfig = upsertConfigPack(config, {
        name: result.packName,
        source: options.source,
        profile: options.profile,
        agents,
      })

      writeAirulesConfig(options.cwd, nextConfig)
      console.info(`Saved pack config for ${result.packName}.`)
    },
    (error: unknown) => {
      throw error instanceof Error ? error : new Error(String(error))
    },
  )
}

function parseAgentList(agent: string | undefined): AgentName[] | undefined {
  if (!agent) {
    return undefined
  }

  const agents: AgentName[] = []
  for (const item of agent.split(',')) {
    const trimmed = item.trim()
    if (trimmed.length > 0) {
      agents.push(trimmed as AgentName)
    }
  }

  return agents.length > 0 ? agents : undefined
}

function loadConfigOrCreateEmpty(cwd: string): AirulesConfig {
  try {
    return loadAirulesConfigSync(cwd)
  } catch {
    return {
      version: 1,
      packs: [],
      install: {
        conflict: 'warn',
      },
      security: {
        trustedSources: [],
        allowScripts: false,
        requirePinnedVersion: false,
      },
    }
  }
}

function printInstallSummary(
  operations: Array<{
    target: string
    installId: string
    agent: AgentName
    action: string
  }>,
  dryRun: boolean,
): void {
  console.info(dryRun ? 'airules add dry-run' : 'airules add')

  for (const operation of operations) {
    console.info(
      `- ${operation.action}: ${operation.target} (${operation.agent}:${operation.installId})`,
    )
  }
}
