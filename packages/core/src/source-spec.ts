export function normalizePackSourceInput(source: string): string {
  const trimmed = source.trim()
  if (trimmed.startsWith('github:') || trimmed.startsWith('npm:')) {
    return trimmed
  }

  const githubUrlSource = normalizeGitHubUrl(trimmed)
  if (githubUrlSource !== null) {
    return githubUrlSource
  }

  if (isAgentMdSnippetSource(trimmed)) {
    return trimmed
  }

  if (isGitHubShorthand(trimmed)) {
    return `github:${trimmed}`
  }

  if (isNpmPackageSpec(trimmed)) {
    return `npm:${trimmed}`
  }

  return trimmed
}

export function isDirectPackSourceInput(source: string): boolean {
  const normalized = normalizePackSourceInput(source)

  return (
    normalized.startsWith('./') ||
    normalized.startsWith('../') ||
    normalized.startsWith('/') ||
    normalized.startsWith('agents/') ||
    normalized.startsWith('local:') ||
    normalized.startsWith('file://') ||
    normalized.startsWith('github:') ||
    normalized.startsWith('npm:') ||
    normalized.startsWith('http://') ||
    normalized.startsWith('https://')
  )
}

function isAgentMdSnippetSource(source: string): boolean {
  return source === 'agents' || source.startsWith('agents/')
}

function normalizeGitHubUrl(source: string): string | null {
  if (!source.startsWith('https://github.com/')) {
    return null
  }

  const url = new URL(source)
  const segments = url.pathname.split('/').filter(segment => segment.length > 0)
  if (segments.length < 2) {
    return null
  }

  const owner = segments[0]
  const repo = segments[1]
  if (!owner || !repo) {
    return null
  }

  if (
    segments.length >= 4 &&
    (segments[2] === 'tree' || segments[2] === 'blob')
  ) {
    const ref = segments[3]
    const path = segments.slice(4).join('/')
    return createGitHubSource(owner, repo, path, ref)
  }

  const path = segments.slice(2).join('/')
  const ref = url.hash.length > 1 ? url.hash.slice(1) : undefined
  return createGitHubSource(owner, repo, path, ref)
}

function createGitHubSource(
  owner: string,
  repo: string,
  path: string,
  ref: string | undefined,
): string {
  const sourcePath = [owner, repo, path]
    .filter(part => part.length > 0)
    .join('/')
  return ref && ref.length > 0
    ? `github:${sourcePath}#${ref}`
    : `github:${sourcePath}`
}

function isGitHubShorthand(source: string): boolean {
  if (
    source.startsWith('@') ||
    source.startsWith('github:') ||
    source.startsWith('npm:') ||
    source.startsWith('local:') ||
    source.startsWith('file://') ||
    source.startsWith('./') ||
    source.startsWith('../') ||
    source.startsWith('/') ||
    source.startsWith('http://') ||
    source.startsWith('https://')
  ) {
    return false
  }

  const firstPart = source.split('#')[0]
  const withoutRef = firstPart !== undefined ? firstPart : ''
  const segments = withoutRef.split('/').filter(segment => segment.length > 0)
  return segments.length >= 2
}

function isNpmPackageSpec(source: string): boolean {
  if (source.startsWith('npm:')) {
    return true
  }

  if (
    source.startsWith('github:') ||
    source.startsWith('local:') ||
    source.startsWith('file://') ||
    source.startsWith('./') ||
    source.startsWith('../') ||
    source.startsWith('/') ||
    source.startsWith('http://') ||
    source.startsWith('https://')
  ) {
    return false
  }

  return findVersionAtIndex(source) !== -1
}

function findVersionAtIndex(value: string): number {
  if (value.startsWith('@')) {
    const slashIndex = value.indexOf('/')
    if (slashIndex === -1) {
      return -1
    }
    return value.indexOf('@', slashIndex + 1)
  }

  return value.indexOf('@')
}
