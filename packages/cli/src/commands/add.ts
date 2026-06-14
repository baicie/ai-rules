import type { AgentName, AirulesConfig } from '@baicie/airules-schema'
import {
  installPack,
  loadAirulesConfigSync,
  resolvePackAlias,
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
  registry?: string
}

export async function runAddCommand(options: AddCommandOptions): Promise<void> {
  const agents = parseAgentList(options.agent)
  const config = loadConfigOrCreateEmpty(options.cwd)

  const resolvedAlias = await resolvePackAlias({
    cwd: options.cwd,
    source: options.source,
    config,
    registrySource: options.registry,
  })

  const securityResult = validateSourceSecurity(
    resolvedAlias.source,
    config.security,
  )

  for (const warning of securityResult.warnings) {
    console.warn(`warning: ${warning}`)
  }

  const result = await installPack({
    cwd: options.cwd,
    source: resolvedAlias.source,
    ...(options.profile !== undefined ? { profile: options.profile } : {}),
    ...(agents !== undefined ? { agents } : {}),
    dryRun: options.dryRun === true,
  })

  printInstallSummary(result.operations, options.dryRun === true)

  if (options.dryRun === true || options.save === false) {
    return
  }

  const nextConfig = upsertConfigPack(config, {
    name: resolvedAlias.name ?? result.packName,
    source: resolvedAlias.source,
    ...(options.profile !== undefined ? { profile: options.profile } : {}),
    ...(agents !== undefined ? { agents } : {}),
  })

  writeAirulesConfig(options.cwd, nextConfig)
  console.info(`Saved pack config for ${result.packName}.`)
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
      registries: [
        {
          name: 'default',
          source: 'github:baicie/ai-rules/registry.json#main',
        },
      ],
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
