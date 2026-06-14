import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runPackBuildCommand, runPackValidateCommand } from './pack'

let currentTmpDir: string | null = null

function createPack(): {
  cwd: string
  packRoot: string
} {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-cli-pack-'))
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
  vi.restoreAllMocks()

  if (currentTmpDir) {
    rmSync(currentTmpDir, {
      recursive: true,
      force: true,
    })
    currentTmpDir = null
  }
})

describe('pack commands', () => {
  it('prints validate result', async () => {
    const { cwd, packRoot } = createPack()
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    await runPackValidateCommand({
      cwd,
      packPath: packRoot,
    })

    const output = info.mock.calls.map(call => call.join(' ')).join('\n')
    expect(output).toContain('airules pack validate')
    expect(output).toContain('pack-schema-valid')
  })

  it('prints build result', async () => {
    const { cwd, packRoot } = createPack()
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    await runPackBuildCommand({
      cwd,
      packPath: packRoot,
      out: join(cwd, 'dist/react-shadcn'),
    })

    const output = info.mock.calls.map(call => call.join(' ')).join('\n')
    expect(output).toContain('airules pack build')
    expect(output).toContain('@baicie/react-shadcn@0.1.0')
  })
})
