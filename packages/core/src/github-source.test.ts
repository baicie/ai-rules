import { Buffer } from 'node:buffer'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AIRULES_CACHE_ENV } from './cache-path'
import {
  getGitHubPackCacheRoot,
  normalizeGitHubPath,
  parseGitHubSource,
  resolveGitHubPackSource,
} from './github-source'
import { assertInsideDirectory } from './path-utils'

let currentTmpDir: string | null = null

function createTempProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-github-'))
  return currentTmpDir
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()

  if (currentTmpDir) {
    rmSync(currentTmpDir, {
      recursive: true,
      force: true,
    })
    currentTmpDir = null
  }
})

describe('parseGitHubSource', () => {
  it('parses github source with path and ref', () => {
    expect(
      parseGitHubSource('github:baicie/ai-rules/packs/react-shadcn#v0.1.0'),
    ).toEqual({
      owner: 'baicie',
      repo: 'ai-rules',
      path: 'packs/react-shadcn',
      ref: 'v0.1.0',
    })
  })

  it('parses github source without path', () => {
    expect(parseGitHubSource('github:baicie/ai-rules#main')).toEqual({
      owner: 'baicie',
      repo: 'ai-rules',
      path: '',
      ref: 'main',
    })
  })

  it('throws for invalid source', () => {
    expect(() => parseGitHubSource('github:baicie')).toThrow(
      /Expected github:owner\/repo\/path#ref/,
    )
  })

  it('throws for empty ref', () => {
    expect(() => parseGitHubSource('github:baicie/ai-rules#')).toThrow(
      /empty ref/,
    )
  })
})

describe('resolveGitHubPackSource', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', createMockFetch())
  })

  it('downloads github pack into cache and resolves commit', () => {
    const cwd = createTempProject()
    vi.stubEnv(AIRULES_CACHE_ENV, join(cwd, 'global-cache'))

    return resolveGitHubPackSource(
      'github:baicie/ai-rules/packs/react-shadcn#v0.1.0',
      cwd,
    ).then(resolved => {
      expect(resolved.resolved).toEqual({
        type: 'github',
        owner: 'baicie',
        repo: 'ai-rules',
        path: 'packs/react-shadcn',
        ref: 'v0.1.0',
        commit: 'commit-sha-123',
      })

      expect(existsSync(join(resolved.root, 'airules.pack.json'))).toBe(true)
      expect(existsSync(join(resolved.root, 'modules/core.md'))).toBe(true)
      expect(resolved.root).toContain(join(cwd, 'global-cache', 'packs'))

      const pack = readFileSync(
        join(resolved.root, 'airules.pack.json'),
        'utf8',
      )
      expect(pack).toContain('@baicie/react-shadcn')
    })
  })

  it('uses default branch when ref is omitted', () => {
    const cwd = createTempProject()
    vi.stubEnv(AIRULES_CACHE_ENV, join(cwd, 'global-cache'))

    return resolveGitHubPackSource(
      'github:baicie/ai-rules/packs/react-shadcn',
      cwd,
    ).then(resolved => {
      expect(resolved.resolved.ref).toBe('main')
      expect(resolved.resolved.commit).toBe('commit-sha-123')
    })
  })

  it('creates deterministic cache path', () => {
    vi.stubEnv(AIRULES_CACHE_ENV, '/airules-cache')

    const cacheRoot = getGitHubPackCacheRoot('/repo', {
      owner: 'baicie',
      repo: 'ai-rules',
      commit: 'abc',
      path: 'packs/react-shadcn',
    })

    expect(cacheRoot).toMatch(
      /[\\/]airules-cache[\\/]packs[\\/]github[\\/]baicie[\\/]ai-rules[\\/]abc[\\/]/,
    )
  })

  it('resolves repository shorthand root through registry defaultPack', () => {
    const cwd = createTempProject()
    vi.stubEnv(AIRULES_CACHE_ENV, join(cwd, 'global-cache'))
    vi.stubGlobal('fetch', createRepoRootMockFetch())

    return resolveGitHubPackSource('github:baicie/ai-rules#main', cwd).then(
      resolved => {
        expect(resolved.resolved).toEqual({
          type: 'github',
          owner: 'baicie',
          repo: 'ai-rules',
          path: 'packs/react-shadcn',
          ref: 'main',
          commit: 'commit-sha-123',
        })

        expect(existsSync(join(resolved.root, 'airules.pack.json'))).toBe(true)
        expect(existsSync(join(resolved.root, 'modules/core.md'))).toBe(true)
        expect(resolved.root).toMatch(/[\\/]packs[\\/]react-shadcn$/)
      },
    )
  })

  it('throws for repository root with multiple registry packs and no defaultPack', async () => {
    const cwd = createTempProject()
    vi.stubEnv(AIRULES_CACHE_ENV, join(cwd, 'global-cache'))
    vi.stubGlobal('fetch', createRepoRootMockFetch({ omitDefaultPack: true }))

    await expect(
      resolveGitHubPackSource('github:baicie/ai-rules#main', cwd),
    ).rejects.toThrow(/multiple packs but no defaultPack/)
  })
})

function createMockFetch(): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input)

    if (url === 'https://api.github.com/repos/baicie/ai-rules') {
      return createJsonResponse({
        default_branch: 'main',
      })
    }

    if (
      url === 'https://api.github.com/repos/baicie/ai-rules/commits/v0.1.0' ||
      url === 'https://api.github.com/repos/baicie/ai-rules/commits/main'
    ) {
      return createJsonResponse({
        sha: 'commit-sha-123',
        commit: {
          tree: {
            sha: 'tree-sha-123',
          },
        },
      })
    }

    if (
      url ===
      'https://api.github.com/repos/baicie/ai-rules/git/trees/tree-sha-123?recursive=1'
    ) {
      return createJsonResponse({
        truncated: false,
        tree: [
          {
            path: 'packs/react-shadcn/airules.pack.json',
            type: 'blob',
            sha: 'blob-pack',
          },
          {
            path: 'packs/react-shadcn/modules/core.md',
            type: 'blob',
            sha: 'blob-core',
          },
          {
            path: 'README.md',
            type: 'blob',
            sha: 'blob-readme',
          },
        ],
      })
    }

    if (
      url === 'https://api.github.com/repos/baicie/ai-rules/git/blobs/blob-pack'
    ) {
      return createJsonResponse({
        encoding: 'base64',
        content: Buffer.from(
          JSON.stringify({
            name: '@baicie/react-shadcn',
            version: '0.1.0',
            modules: {
              core: 'modules/core.md',
            },
            installs: [
              {
                id: 'codex',
                agent: 'codex',
                target: 'AGENTS.md',
                mode: 'modules',
                concat: ['core'],
              },
            ],
          }),
        ).toString('base64'),
      })
    }

    if (
      url === 'https://api.github.com/repos/baicie/ai-rules/git/blobs/blob-core'
    ) {
      return createJsonResponse({
        encoding: 'base64',
        content: Buffer.from('## Core\n\n- Use TypeScript.').toString('base64'),
      })
    }

    return createJsonResponse(
      {
        message: `Unexpected URL: ${url}`,
      },
      404,
    )
  }) as typeof fetch
}

function createJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Not Found',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response
}

function createRepoRootMockFetch(
  options: { omitDefaultPack?: boolean } = {},
): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input)

    if (url === 'https://api.github.com/repos/baicie/ai-rules') {
      return createJsonResponse({ default_branch: 'main' })
    }

    if (url === 'https://api.github.com/repos/baicie/ai-rules/commits/main') {
      return createJsonResponse({
        sha: 'commit-sha-123',
        commit: { tree: { sha: 'tree-sha-123' } },
      })
    }

    if (
      url ===
      'https://api.github.com/repos/baicie/ai-rules/git/trees/tree-sha-123?recursive=1'
    ) {
      return createJsonResponse({
        truncated: false,
        tree: [
          { path: 'registry.json', type: 'blob', sha: 'blob-registry' },
          {
            path: 'packs/react-shadcn/airules.pack.json',
            type: 'blob',
            sha: 'blob-pack',
          },
          {
            path: 'packs/react-shadcn/modules/core.md',
            type: 'blob',
            sha: 'blob-core',
          },
          {
            path: 'packs/ts-monorepo/airules.pack.json',
            type: 'blob',
            sha: 'blob-ts-pack',
          },
        ],
      })
    }

    if (
      url ===
      'https://api.github.com/repos/baicie/ai-rules/git/blobs/blob-registry'
    ) {
      return createJsonResponse({
        encoding: 'base64',
        content: Buffer.from(
          JSON.stringify({
            name: '@baicie/default',
            version: '0.1.0',
            ...(options.omitDefaultPack
              ? {}
              : { defaultPack: '@baicie/react-shadcn' }),
            packs: [
              {
                name: '@baicie/react-shadcn',
                source: 'github:baicie/ai-rules/packs/react-shadcn#v0.1.0',
                aliases: ['shadcn', 'react-shadcn'],
              },
              {
                name: '@baicie/ts-monorepo',
                source: 'github:baicie/ai-rules/packs/ts-monorepo#v0.1.0',
                aliases: ['ts-monorepo'],
              },
            ],
          }),
        ).toString('base64'),
      })
    }

    if (
      url === 'https://api.github.com/repos/baicie/ai-rules/git/blobs/blob-pack'
    ) {
      return createJsonResponse({
        encoding: 'base64',
        content: Buffer.from(
          JSON.stringify({
            name: '@baicie/react-shadcn',
            version: '0.1.0',
            modules: { core: 'modules/core.md' },
            installs: [
              {
                id: 'codex',
                agent: 'codex',
                target: 'AGENTS.md',
                mode: 'modules',
                concat: ['core'],
              },
            ],
          }),
        ).toString('base64'),
      })
    }

    if (
      url ===
      'https://api.github.com/repos/baicie/ai-rules/git/blobs/blob-ts-pack'
    ) {
      return createJsonResponse({
        encoding: 'base64',
        content: Buffer.from(
          JSON.stringify({
            name: '@baicie/ts-monorepo',
            version: '0.1.0',
            modules: { core: 'modules/core.md' },
            installs: [
              {
                id: 'codex',
                agent: 'codex',
                target: 'AGENTS.md',
                mode: 'modules',
                concat: ['core'],
              },
            ],
          }),
        ).toString('base64'),
      })
    }

    if (
      url === 'https://api.github.com/repos/baicie/ai-rules/git/blobs/blob-core'
    ) {
      return createJsonResponse({
        encoding: 'base64',
        content: Buffer.from('## Core\n\n- Use TypeScript.').toString('base64'),
      })
    }

    return createJsonResponse({ message: `Unexpected URL: ${url}` }, 404)
  }) as typeof fetch
}

describe('github path safety', () => {
  it('rejects dot-dot path segments', () => {
    expect(() => normalizeGitHubPath('packs/../evil')).toThrow(
      /Invalid GitHub path segment/,
    )
  })

  it('rejects writes outside cache root', () => {
    expect(() =>
      assertInsideDirectory('/tmp/cache/root', '/tmp/cache/root-evil/file.md'),
    ).toThrow(/Refusing to access path outside root/)
  })

  it('allows writes inside cache root', () => {
    expect(() =>
      assertInsideDirectory('/tmp/cache/root', '/tmp/cache/root/file.md'),
    ).not.toThrow()
  })
})
