import type {
  AgentName,
  AirulesInstall,
  AirulesPack,
  AirulesProfile,
} from '@baicie/airules-schema'

export interface ResolvedProfile {
  name: string
  installs?: string[]
  variables: Record<string, unknown>
}

export function resolveProfile(
  pack: AirulesPack,
  profileName = 'default',
): ResolvedProfile {
  const profiles = pack.profiles

  if (!profiles || Object.keys(profiles).length === 0) {
    return {
      name: profileName,
      installs: pack.installs.map((install: AirulesInstall) => install.id),
      variables: {},
    }
  }

  if (!profiles[profileName]) {
    throw new Error(`Profile "${profileName}" does not exist in ${pack.name}.`)
  }

  const visited = new Set<string>()

  return resolveProfileInner(profiles, profileName, visited)
}

function resolveProfileInner(
  profiles: Record<string, AirulesProfile>,
  profileName: string,
  visited: Set<string>,
): ResolvedProfile {
  if (visited.has(profileName)) {
    throw new Error(`Circular profile extends detected: ${profileName}`)
  }

  const profile = profiles[profileName]

  if (!profile) {
    throw new Error(`Profile "${profileName}" does not exist.`)
  }

  visited.add(profileName)

  const baseInstalls = profile.extends
    ? resolveProfileInner(profiles, profile.extends, visited).installs
    : undefined

  const baseVariables = profile.extends
    ? resolveProfileInner(profiles, profile.extends, visited).variables
    : {}

  visited.delete(profileName)

  const merged = mergeStringList(baseInstalls, profile.installs)

  const result: ResolvedProfile = {
    name: profileName,
    variables: {
      ...baseVariables,
      ...(profile.variables !== undefined ? profile.variables : {}),
    },
  }

  if (merged !== undefined) {
    result.installs = merged
  }

  return result
}

function mergeStringList(
  base?: string[],
  current?: string[],
): string[] | undefined {
  if (!base && !current) {
    return undefined
  }

  const result = new Set<string>()
  const baseItems = base !== undefined ? base : []
  const currentItems = current !== undefined ? current : []
  for (const item of baseItems) {
    result.add(item)
  }
  for (const item of currentItems) {
    result.add(item)
  }
  return Array.from(result)
}

export function selectInstalls(
  pack: AirulesPack,
  options?: {
    profile?: string
    agents?: AgentName[]
  },
): AirulesInstall[] {
  const profileName =
    options && options.profile !== undefined ? options.profile : 'default'
  const resolvedProfile = resolveProfile(pack, profileName)

  const fallbackIds = pack.installs.map((install: AirulesInstall) => install.id)
  const selectedIds =
    resolvedProfile.installs !== undefined
      ? resolvedProfile.installs
      : fallbackIds
  const installIdSet = new Set<string>(selectedIds)

  const missingInstallIds: string[] = []
  for (const installId of installIdSet) {
    const exists = pack.installs.some(
      (install: AirulesInstall) => install.id === installId,
    )
    if (!exists) {
      missingInstallIds.push(installId)
    }
  }

  if (missingInstallIds.length > 0) {
    throw new Error(
      `Profile references missing install ids: ${missingInstallIds.join(', ')}`,
    )
  }

  const agentSet = options && options.agents ? new Set(options.agents) : null

  return pack.installs.filter((install: AirulesInstall) => {
    if (!installIdSet.has(install.id)) {
      return false
    }

    if (agentSet && !agentSet.has(install.agent)) {
      return false
    }

    return true
  })
}
