import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isDirectPackSource,
  loadRegistry,
  resolvePackAlias,
  resolveRegistryRefs,
  searchRegistries,
} from './registry'

let currentTmpDir: string | null = null

function createProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-registry-'))
  return currentTmpDir
}

function writeRegistry(cwd: string): void {
  writeFileSync(
    join(cwd, 'registry.json'),
    JSON.stringify(
      {
        name: '@baicie/default',
        version: '0.1.0',
        packs: [
          {
            name: '@baicie/react-shadcn',
            source: './packs/react-shadcn',
            version: '0.1.0',
            description: 'React shadcn rules',
            tags: ['react', 'shadcn'],
            aliases: ['react-shadcn', 'shadcn'],
          },
          {
            name: '@baicie/java-spring',
            source: './packs/java-spring',
            version: '0.1.0',
            description: 'Java Spring rules',
            tags: ['java', 'spring'],
            aliases: ['spring'],
          },
        ],
      },
      null,
      2,
    ),
  )
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

describe('isDirectPackSource', () => {
  it('detects direct sources', () => {
    expect(isDirectPackSource('./packs/a')).toBe(true)
    expect(isDirectPackSource('../packs/a')).toBe(true)
    expect(isDirectPackSource('local:./packs/a')).toBe(true)
    expect(isDirectPackSource('github:baicie/ai-rules/packs/a#main')).toBe(true)
    expect(isDirectPackSource('@baicie/react-shadcn')).toBe(false)
    expect(isDirectPackSource('react-shadcn')).toBe(false)
  })
})

describe('loadRegistry', () => {
  it('loads local registry', async () => {
    const cwd = createProject()
    writeRegistry(cwd)

    const registry = await loadRegistry({
      cwd,
      source: './registry.json',
    })

    expect(registry.name).toBe('@baicie/default')
    expect(registry.packs).toHaveLength(2)
  })

  it('loads http registry', async () => {
    vi.stubGlobal('fetch', async () => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () =>
          JSON.stringify({
            packs: [
              {
                name: '@baicie/react-shadcn',
                source: './packs/react-shadcn',
              },
            ],
          }),
      } as Response
    })

    const registry = await loadRegistry({
      cwd: process.cwd(),
      source: 'https://example.com/registry.json',
    })

    expect(registry.packs[0]?.name).toBe('@baicie/react-shadcn')
  })
})

describe('resolveRegistryRefs', () => {
  it('uses explicit registry first', () => {
    expect(
      resolveRegistryRefs(
        {
          version: 1,
          registries: [
            {
              source: './registry.json',
            },
          ],
          packs: [],
        },
        './custom.json',
      ),
    ).toEqual([
      {
        source: './custom.json',
      },
    ])
  })

  it('uses config registries', () => {
    expect(
      resolveRegistryRefs(
        {
          version: 1,
          registries: [
            {
              name: 'local',
              source: './registry.json',
            },
          ],
          packs: [],
        },
        undefined,
      ),
    ).toEqual([
      {
        name: 'local',
        source: './registry.json',
      },
    ])
  })

  it('falls back to default registry when config has none', () => {
    expect(
      resolveRegistryRefs(
        {
          version: 1,
          packs: [],
        },
        undefined,
      ),
    ).toEqual([
      {
        name: 'default',
        source: 'github:baicie/ai-rules/registry.json#main',
      },
    ])
  })
})

describe('resolvePackAlias', () => {
  it('returns direct source unchanged', async () => {
    const result = await resolvePackAlias({
      cwd: process.cwd(),
      source: './packs/react-shadcn',
    })

    expect(result.source).toBe('./packs/react-shadcn')
    expect(result.name).toBeUndefined()
  })

  it('resolves pack by name', async () => {
    const cwd = createProject()
    writeRegistry(cwd)

    const result = await resolvePackAlias({
      cwd,
      source: '@baicie/react-shadcn',
      registrySource: './registry.json',
    })

    expect(result.name).toBe('@baicie/react-shadcn')
    expect(result.source).toBe('./packs/react-shadcn')
  })

  it('resolves pack by alias', async () => {
    const cwd = createProject()
    writeRegistry(cwd)

    const result = await resolvePackAlias({
      cwd,
      source: 'shadcn',
      registrySource: './registry.json',
    })

    expect(result.name).toBe('@baicie/react-shadcn')
    expect(result.source).toBe('./packs/react-shadcn')
  })

  it('throws when alias is missing', async () => {
    const cwd = createProject()
    writeRegistry(cwd)

    await expect(
      resolvePackAlias({
        cwd,
        source: 'missing',
        registrySource: './registry.json',
      }),
    ).rejects.toThrow(/Cannot resolve airules pack/)
  })
})

describe('searchRegistries', () => {
  it('searches registry packs by tag and alias', async () => {
    const cwd = createProject()
    writeRegistry(cwd)

    const results = await searchRegistries({
      cwd,
      query: 'shadcn',
      registrySource: './registry.json',
    })

    expect(results).toHaveLength(1)
    expect(results[0]?.pack.name).toBe('@baicie/react-shadcn')
  })

  it('returns all packs when query is empty', async () => {
    const cwd = createProject()
    writeRegistry(cwd)

    const results = await searchRegistries({
      cwd,
      registrySource: './registry.json',
    })

    expect(results.map(item => item.pack.name)).toEqual([
      '@baicie/java-spring',
      '@baicie/react-shadcn',
    ])
  })
})
