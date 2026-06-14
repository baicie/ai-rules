import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runRegistryPublishCommand } from './registry-publish'

let currentTmpDir: string | null = null

function createPack(): {
  cwd: string
  packRoot: string
} {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-cli-registry-publish-'))
  const packRoot = join(currentTmpDir, 'packs/react-shadcn')

  mkdirSync(join(packRoot, 'modules'), {
    recursive: true,
  })

  writeFileSync(
    join(packRoot, 'airules.pack.json'),
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

describe('runRegistryPublishCommand', () => {
  it('writes registry entry', async () => {
    const { cwd, packRoot } = createPack()

    await runRegistryPublishCommand({
      cwd,
      packPath: packRoot,
      registry: './registry.json',
      source: './packs/react-shadcn',
      alias: 'shadcn,react-shadcn',
      tag: 'react,shadcn',
    })

    const registry = JSON.parse(
      readFileSync(join(cwd, 'registry.json'), 'utf8'),
    )

    expect(registry.packs[0].name).toBe('@baicie/react-shadcn')
    expect(registry.packs[0].aliases).toEqual(['shadcn', 'react-shadcn'])
    expect(registry.packs[0].tags).toEqual(['react', 'shadcn'])
  })
})
