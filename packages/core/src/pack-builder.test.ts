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
import { buildPack } from './pack-builder'

let currentTmpDir: string | null = null

function createPack(): {
  cwd: string
  packRoot: string
} {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-build-'))
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

describe('buildPack', () => {
  it('builds pack into output directory', () => {
    const { cwd, packRoot } = createPack()
    const out = join(cwd, 'dist/react-shadcn')

    const result = buildPack({
      cwd,
      packPath: packRoot,
      outDir: out,
    })

    expect(result.packName).toBe('@baicie/react-shadcn')
    expect(existsSync(join(out, 'airules.pack.json'))).toBe(true)
    expect(existsSync(join(out, 'modules/core.md'))).toBe(true)
    expect(existsSync(join(out, 'airules.build.json'))).toBe(true)

    const manifest = readFileSync(join(out, 'airules.build.json'), 'utf8')
    expect(manifest).toContain('@baicie/react-shadcn')
  })
})
