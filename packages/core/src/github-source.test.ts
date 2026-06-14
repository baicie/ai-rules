import { Buffer } from 'node:buffer'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getGitHubPackCacheRoot,
  parseGitHubSource,
  resolveGitHubPackSource,
} from './github-source'

let currentTmpDir: string | null = null

function createTempProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-github-'))
  return currentTmpDir
}

afterEach(() => {
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

      const pack = readFileSync(
        join(resolved.root, 'airules.pack.json'),
        'utf8',
      )
      expect(pack).toContain('@baicie/react-shadcn')
    })
  })

  it('uses default branch when ref is omitted', () => {
    const cwd = createTempProject()

    return resolveGitHubPackSource(
      'github:baicie/ai-rules/packs/react-shadcn',
      cwd,
    ).then(resolved => {
      expect(resolved.resolved.ref).toBe('main')
      expect(resolved.resolved.commit).toBe('commit-sha-123')
    })
  })

  it('creates deterministic cache path', () => {
    const cacheRoot = getGitHubPackCacheRoot('/repo', {
      owner: 'baicie',
      repo: 'ai-rules',
      commit: 'abc',
      path: 'packs/react-shadcn',
    })

    expect(cacheRoot).toMatch(
      /[\\/]repo[\\/]\.agents[\\/]agent[\\/]cache[\\/]github[\\/]baicie[\\/]ai-rules[\\/]abc[\\/]/,
    )
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
