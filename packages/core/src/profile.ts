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

  return resolveProfileInner(profiles, profileName, new Set<string>())
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

  const base: ResolvedProfile = profile.extends
    ? resolveProfileInner(profiles, profile.extends, visited)
    : {
        name: profileName,
        variables: {},
      }

  visited.delete(profileName)

  const mergedInstalls = mergeStringList(base.installs, profile.installs)
  const profileVariables =
    profile.variables !== undefined ? profile.variables : {}

  const result: ResolvedProfile = {
    name: profileName,
    variables: extendVariables(base.variables, profileVariables),
  }

  if (mergedInstalls !== undefined) {
    result.installs = mergedInstalls
  }

  return result
}

function extendVariables(
  base: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {}

  for (const key of Object.keys(base)) {
    merged[key] = base[key]
  }

  for (const key of Object.keys(current)) {
    merged[key] = current[key]
  }

  return merged
}

function mergeStringList(
  base?: string[],
  current?: string[],
): string[] | undefined {
  if (!base && !current) {
    return undefined
  }

  const result = new Set<string>()

  for (const item of base !== undefined ? base : []) {
    result.add(item)
  }

  for (const item of current !== undefined ? current : []) {
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
