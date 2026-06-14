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
import { afterEach, describe, expect, it } from 'vitest'
import { publishPackToRegistry } from './registry-publish'

let currentTmpDir: string | null = null

function createPack(): {
  cwd: string
  packRoot: string
} {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-registry-publish-'))
  const packRoot = join(currentTmpDir, 'packs/react-shadcn')

  mkdirSync(join(packRoot, 'modules'), {
    recursive: true,
  })

  writeFileSync(
    join(packRoot, 'airules.pack.json'),
    JSON.stringify({
      name: '@baicie/react-shadcn',
      version: '0.1.0',
      description: 'React shadcn rules',
      keywords: ['react', 'shadcn'],
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

  writeFileSync(join(packRoot, 'modules/core.md'), '## Core\n')

  return {
    cwd: currentTmpDir,
    packRoot,
  }
}

afterEach(() => {
  if (currentTmpDir) {
    rmSync(currentTmpDir, {
      recursive: true,
      force: true,
    })
    currentTmpDir = null
  }
})

describe('publishPackToRegistry', () => {
  it('creates registry json and writes pack entry', () => {
    const { cwd, packRoot } = createPack()

    const result = publishPackToRegistry({
      cwd,
      packPath: packRoot,
      registryPath: './registry.json',
      source: 'github:baicie/ai-rules/packs/react-shadcn#v0.1.0',
      aliases: ['shadcn'],
    })

    expect(result.action).toBe('create-registry')
    expect(result.pack.name).toBe('@baicie/react-shadcn')

    const registry = JSON.parse(
      readFileSync(join(cwd, 'registry.json'), 'utf8'),
    )
    expect(registry.packs[0].name).toBe('@baicie/react-shadcn')
    expect(registry.packs[0].aliases).toEqual(['shadcn'])
    expect(registry.packs[0].tags).toEqual(['react', 'shadcn'])
  })

  it('updates existing pack entry', () => {
    const { cwd, packRoot } = createPack()

    writeFileSync(
      join(cwd, 'registry.json'),
      JSON.stringify({
        packs: [
          {
            name: '@baicie/react-shadcn',
            source: './old',
          },
        ],
      }),
    )

    const result = publishPackToRegistry({
      cwd,
      packPath: packRoot,
      registryPath: './registry.json',
      source: './new',
    })

    expect(result.action).toBe('update-pack')

    const registry = JSON.parse(
      readFileSync(join(cwd, 'registry.json'), 'utf8'),
    )
    expect(registry.packs).toHaveLength(1)
    expect(registry.packs[0].source).toBe('./new')
  })

  it('creates parent directory for registry path', () => {
    const { cwd, packRoot } = createPack()

    publishPackToRegistry({
      cwd,
      packPath: packRoot,
      registryPath: 'dist/registry/registry.json',
      source: './packs/react-shadcn',
    })

    expect(existsSync(join(cwd, 'dist/registry/registry.json'))).toBe(true)
  })
})
