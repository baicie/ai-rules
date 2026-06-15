import type {
  AgentName,
  AirulesConfig,
  AirulesConfigPack,
  AirulesUserConfig,
} from '@baicie/airules-schema'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_AIRULES_REGISTRY_SOURCE } from '@baicie/airules-schema'
import { getAirulesAgentDir, resolveAirulesConfigPath } from './config-loader'

export function upsertConfigPack(
  config: AirulesConfig,
  packEntry: AirulesConfigPack,
): AirulesConfig {
  const index = config.packs.findIndex(pack => {
    if (packEntry.name && pack.name === packEntry.name) {
      return true
    }

    return pack.source === packEntry.source
  })

  const nextPacks: AirulesConfigPack[] = []
  for (const pack of config.packs) {
    nextPacks.push(pack)
  }

  if (index === -1) {
    nextPacks.push(packEntry)
  } else {
    const previous = nextPacks[index]
    nextPacks[index] = mergeConfigPack(previous, packEntry)
  }

  const nextConfig: AirulesConfig = {
    version: 1,
    packs: nextPacks,
  }

  if (config.$schema !== undefined) {
    nextConfig.$schema = config.$schema
  }

  if (config.registries !== undefined) {
    nextConfig.registries = config.registries
  }

  if (config.install !== undefined) {
    nextConfig.install = config.install
  }

  if (config.security !== undefined) {
    nextConfig.security = config.security
  }

  return nextConfig
}

function mergeConfigPack(
  previous: AirulesConfigPack | undefined,
  incoming: AirulesConfigPack,
): AirulesConfigPack {
  const next: AirulesConfigPack = {
    source: incoming.source,
  }

  if (incoming.name !== undefined) {
    next.name = incoming.name
  } else if (previous?.name !== undefined) {
    next.name = previous.name
  }

  if (incoming.profile !== undefined) {
    next.profile = incoming.profile
  } else if (previous?.profile !== undefined) {
    next.profile = previous.profile
  }

  const agents = mergeAgents(previous?.agents, incoming.agents)
  if (agents !== undefined) {
    next.agents = agents
  }

  const variables = mergeVariables(previous?.variables, incoming.variables)
  if (variables !== undefined) {
    next.variables = variables
  }

  return next
}

function mergeAgents(
  previous: AgentName[] | undefined,
  incoming: AgentName[] | undefined,
): AgentName[] | undefined {
  if (!previous && !incoming) {
    return undefined
  }

  const result = new Set<AgentName>()

  for (const agent of previous ?? []) {
    result.add(agent)
  }

  for (const agent of incoming ?? []) {
    result.add(agent)
  }

  return Array.from(result)
}

function mergeVariables(
  previous: Record<string, unknown> | undefined,
  incoming: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!previous && !incoming) {
    return undefined
  }

  return {
    ...(previous ?? {}),
    ...(incoming ?? {}),
  }
}

export function writeAirulesConfig(cwd: string, config: AirulesConfig): void {
  const resolved = resolveAirulesConfigPath(cwd)
  const configPath =
    resolved !== null
      ? resolved.path
      : join(getAirulesAgentDir(cwd), 'airules.config.ts')

  mkdirSync(dirname(configPath), {
    recursive: true,
  })

  if (configPath.endsWith('.json')) {
    writeFileSync(
      configPath,
      `${JSON.stringify(toUserConfig(config), null, 2)}\n`,
    )
    return
  }

  writeFileSync(configPath, renderTypeScriptConfig(config))
}

function renderTypeScriptConfig(config: AirulesConfig): string {
  return `export default ${JSON.stringify(toUserConfig(config), null, 2)}
`
}

function toUserConfig(config: AirulesConfig): AirulesUserConfig {
  const userConfig: AirulesUserConfig = {}

  if (config.$schema !== undefined) {
    userConfig.$schema = config.$schema
  }

  if (
    config.registries !== undefined &&
    !isDefaultRegistries(config.registries)
  ) {
    userConfig.registries = config.registries
  }

  userConfig.packs = config.packs

  if (config.install !== undefined && !isEmptyObject(config.install)) {
    userConfig.install = config.install
  }

  if (config.security !== undefined && !isDefaultSecurity(config.security)) {
    userConfig.security = config.security
  }

  return userConfig
}

function isDefaultRegistries(
  registries: NonNullable<AirulesConfig['registries']>,
): boolean {
  return (
    registries.length === 1 &&
    registries[0]?.source === DEFAULT_AIRULES_REGISTRY_SOURCE
  )
}

function isDefaultSecurity(
  security: NonNullable<AirulesConfig['security']>,
): boolean {
  const trustedSources = security.trustedSources ?? []

  return (
    trustedSources.length === 0 &&
    security.allowScripts !== true &&
    security.requirePinnedVersion !== true
  )
}

function isEmptyObject(value: object): boolean {
  return Object.keys(value).length === 0
}
