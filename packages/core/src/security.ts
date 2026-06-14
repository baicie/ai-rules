import type { AirulesConfig } from '@baicie/airules-schema'
import { isGitHubSource, parseGitHubSource } from './github-source'

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

  if (
    security.requirePinnedVersion === true &&
    isGitHubSource(source) &&
    !hasPinnedGitHubRef(source)
  ) {
    throw new Error(
      `GitHub source "${source}" is not pinned. Add "#<tag-or-commit>" or disable security.requirePinnedVersion.`,
    )
  }

  const trustedSources =
    security.trustedSources !== undefined ? security.trustedSources : []

  if (trustedSources.length > 0 && !isTrustedSource(source, trustedSources)) {
    warnings.push(
      `Source "${source}" is not listed in security.trustedSources.`,
    )
  }

  return {
    warnings,
  }
}

export function hasPinnedGitHubRef(source: string): boolean {
  if (!isGitHubSource(source)) {
    return true
  }

  const parsed = parseGitHubSource(source)
  return parsed.ref !== undefined && parsed.ref.length > 0
}

export function isTrustedSource(
  source: string,
  trustedSources: string[],
): boolean {
  for (const trustedSource of trustedSources) {
    if (source === trustedSource || source.startsWith(trustedSource)) {
      return true
    }
  }
  return false
}
