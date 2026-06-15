import { Buffer } from 'node:buffer'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as tar from 'tar'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AIRULES_CACHE_ENV } from './cache-path'
import {
  getNpmPackCacheRoot,
  parseNpmSource,
  resolveNpmPackSource,
} from './npm-source'

let currentTmpDir: string | null = null

function createTempProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-npm-'))
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

describe('parseNpmSource', () => {
  it('parses unscoped package without version', () => {
    expect(parseNpmSource('npm:airules-react')).toEqual({
      packageName: 'airules-react',
    })
  })

  it('parses unscoped package with version', () => {
    expect(parseNpmSource('npm:airules-react@0.1.0')).toEqual({
      packageName: 'airules-react',
      version: '0.1.0',
    })
  })

  it('parses scoped package with version', () => {
    expect(parseNpmSource('npm:@baicie/airules-react-shadcn@0.1.0')).toEqual({
      packageName: '@baicie/airules-react-shadcn',
      version: '0.1.0',
    })
  })
})

describe('resolveNpmPackSource', () => {
  it('downloads npm tarball into cache', async () => {
    const cwd = createTempProject()
    vi.stubEnv(AIRULES_CACHE_ENV, join(cwd, 'global-cache'))
    const tarball = await createPackTarball()

    vi.stubGlobal('fetch', createMockFetch(tarball))

    const resolved = await resolveNpmPackSource(
      'npm:@baicie/airules-react-shadcn@0.1.0',
      cwd,
    )

    expect(resolved.resolved).toEqual({
      type: 'npm',
      packageName: '@baicie/airules-react-shadcn',
      version: '0.1.0',
    })

    expect(existsSync(join(resolved.root, 'airules.pack.json'))).toBe(true)
    expect(existsSync(join(resolved.root, 'modules/core.md'))).toBe(true)
    expect(resolved.root).toContain(join(cwd, 'global-cache', 'packs'))
  })

  it('creates deterministic cache root', () => {
    vi.stubEnv(AIRULES_CACHE_ENV, '/airules-cache')

    const cacheRoot = getNpmPackCacheRoot('/repo', {
      packageName: '@baicie/airules-react-shadcn',
      version: '0.1.0',
    })

    expect(cacheRoot).toMatch(
      /[\\/]airules-cache[\\/]packs[\\/]npm[\\/]_baicie_airules-react-shadcn[\\/]0\.1\.0$/,
    )
  })

  it('throws when npm package does not contain airules.pack.json at package root', async () => {
    const cwd = createTempProject()
    vi.stubEnv(AIRULES_CACHE_ENV, join(cwd, 'global-cache'))
    const tarball = await createInvalidPackTarball()

    vi.stubGlobal('fetch', createMockFetch(tarball))

    await expect(
      resolveNpmPackSource('npm:@baicie/airules-react-shadcn@0.1.0', cwd),
    ).rejects.toThrow(/does not contain airules\.pack\.json/)
  })
})

async function createPackTarball(): Promise<Buffer> {
  const root = mkdtempSync(join(tmpdir(), 'airules-npm-pack-'))
  const packageRoot = join(root, 'package')

  mkdirSync(join(packageRoot, 'modules'), {
    recursive: true,
  })

  writeFileSync(
    join(packageRoot, 'airules.pack.json'),
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
  )

  writeFileSync(join(packageRoot, 'modules/core.md'), '## Core\n')

  const tarballPath = join(root, 'package.tgz')

  await tar.c(
    {
      gzip: true,
      file: tarballPath,
      cwd: root,
    },
    ['package'],
  )

  const buffer = Buffer.from(
    await import('node:fs').then(fs => fs.readFileSync(tarballPath)),
  )

  rmSync(root, {
    recursive: true,
    force: true,
  })

  return buffer
}

async function createInvalidPackTarball(): Promise<Buffer> {
  const root = mkdtempSync(join(tmpdir(), 'airules-npm-invalid-pack-'))
  const packageRoot = join(root, 'package')

  mkdirSync(join(packageRoot, 'modules'), {
    recursive: true,
  })

  writeFileSync(join(packageRoot, 'modules/core.md'), '## Core\n')

  const tarballPath = join(root, 'package.tgz')

  await tar.c(
    {
      gzip: true,
      file: tarballPath,
      cwd: root,
    },
    ['package'],
  )

  const buffer = readFileSync(tarballPath)

  rmSync(root, {
    recursive: true,
    force: true,
  })

  return buffer
}

function createMockFetch(tarball: Buffer): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input)

    if (url === 'https://registry.npmjs.org/@baicie%2Fairules-react-shadcn') {
      return createJsonResponse({
        name: '@baicie/airules-react-shadcn',
        'dist-tags': {
          latest: '0.1.0',
        },
        versions: {
          '0.1.0': {
            version: '0.1.0',
            dist: {
              tarball: 'https://registry.npmjs.org/tarball.tgz',
            },
          },
        },
      })
    }

    if (url === 'https://registry.npmjs.org/tarball.tgz') {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () =>
          tarball.buffer.slice(
            tarball.byteOffset,
            tarball.byteOffset + tarball.byteLength,
          ),
      } as Response
    }

    return createJsonResponse({ message: `Unexpected URL: ${url}` }, 404)
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
