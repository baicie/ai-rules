import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createPackScaffold,
  createRegistryScaffold,
  createSkillScaffold,
} from './scaffold'

let currentTmpDir: string | null = null

function createTempProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-scaffold-'))
  return currentTmpDir
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

describe('scaffold', () => {
  it('creates pack scaffold', () => {
    const cwd = createTempProject()

    const result = createPackScaffold({
      cwd,
      name: 'react-shadcn',
    })

    expect(result.files.length).toBeGreaterThan(0)
    expect(existsSync(join(cwd, 'packs/react-shadcn/airules.pack.json'))).toBe(
      true,
    )
    expect(
      existsSync(join(cwd, 'packs/react-shadcn/modules/001-core.md')),
    ).toBe(true)
    expect(
      existsSync(join(cwd, 'packs/react-shadcn/skills/react-shadcn/SKILL.md')),
    ).toBe(true)

    const pack = readFileSync(
      join(cwd, 'packs/react-shadcn/airules.pack.json'),
      'utf8',
    )

    expect(pack).toContain('@baicie/react-shadcn')
  })

  it('creates skill scaffold', () => {
    const cwd = createTempProject()

    createSkillScaffold({
      cwd,
      name: 'shadcn-page',
    })

    const skill = readFileSync(join(cwd, 'skills/shadcn-page/SKILL.md'), 'utf8')
    expect(skill).toContain('name: shadcn-page')
  })

  it('creates registry scaffold', () => {
    const cwd = createTempProject()

    createRegistryScaffold({
      cwd,
    })

    const registry = readFileSync(join(cwd, 'registry.json'), 'utf8')
    expect(registry).toContain('@baicie/default')
  })

  it('does not overwrite existing files unless force is true', () => {
    const cwd = createTempProject()

    createRegistryScaffold({
      cwd,
    })

    const registryPath = join(cwd, 'registry.json')
    const before = readFileSync(registryPath, 'utf8')

    createRegistryScaffold({
      cwd,
    })

    expect(readFileSync(registryPath, 'utf8')).toBe(before)

    createRegistryScaffold({
      cwd,
      force: true,
    })

    expect(readFileSync(registryPath, 'utf8')).toBe(before)
  })
})
