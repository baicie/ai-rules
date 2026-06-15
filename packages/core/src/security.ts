import type { AirulesConfig } from '@baicie/airules-schema'
import { isGitHubSource, parseGitHubSource } from './github-source'
import { normalizePackSourceInput } from './source-spec'

export interface SourceSecurityResult {
  warnings: string[]
}

export function validateSourceSecurity(
  source: string,
  security: AirulesConfig['security'] | undefined,
): SourceSecurityResult {
  const warnings: string[] = []

  if (!security) {
    return {
      warnings,
    }
  }

  const normalizedSource = normalizePackSourceInput(source)

  if (
    security.requirePinnedVersion === true &&
    isGitHubSource(normalizedSource) &&
    !hasPinnedGitHubRef(normalizedSource)
  ) {
    throw new Error(
      `GitHub source "${source}" is not pinned. Add "#<tag-or-commit>" or disable security.requirePinnedVersion.`,
    )
  }

  const trustedSources =
    security.trustedSources !== undefined ? security.trustedSources : []

  if (
    trustedSources.length > 0 &&
    !isTrustedSource(normalizedSource, trustedSources)
  ) {
    warnings.push(
      `Source "${source}" is not listed in security.trustedSources.`,
    )
  }

  return {
    warnings,
  }
}

export function hasPinnedGitHubRef(source: string): boolean {
  const normalizedSource = normalizePackSourceInput(source)

  if (!isGitHubSource(normalizedSource)) {
    return true
  }

  const parsed = parseGitHubSource(normalizedSource)
  return parsed.ref !== undefined && parsed.ref.length > 0
}

export function isTrustedSource(
  source: string,
  trustedSources: string[],
): boolean {
  const normalizedSource = normalizePackSourceInput(source)

  for (const trustedSource of trustedSources) {
    const normalizedTrustedSource = normalizePackSourceInput(trustedSource)

    if (
      normalizedSource === normalizedTrustedSource ||
      normalizedSource.startsWith(normalizedTrustedSource)
    ) {
      return true
    }
  }
  return false
}
