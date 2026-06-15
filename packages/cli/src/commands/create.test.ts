import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  runCreatePackCommand,
  runCreateRegistryCommand,
  runCreateSkillCommand,
} from './create'

let currentTmpDir: string | null = null

function createTempProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-cli-create-'))
  return currentTmpDir
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

describe('create commands', () => {
  it('creates pack scaffold', async () => {
    const cwd = createTempProject()
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    await runCreatePackCommand({
      cwd,
      name: 'react-shadcn',
    })

    expect(existsSync(join(cwd, 'packs/react-shadcn/airules.pack.json'))).toBe(
      true,
    )

    const output = info.mock.calls.map(call => call.join(' ')).join('\n')
    expect(output).toContain('airules create pack')
  })

  it('creates skill scaffold', async () => {
    const cwd = createTempProject()

    await runCreateSkillCommand({
      cwd,
      name: 'shadcn-page',
    })

    expect(existsSync(join(cwd, 'skills/shadcn-page/SKILL.md'))).toBe(true)
  })

  it('creates registry scaffold', async () => {
    const cwd = createTempProject()

    await runCreateRegistryCommand({
      cwd,
    })

    expect(existsSync(join(cwd, 'registry.json'))).toBe(true)
  })
})
