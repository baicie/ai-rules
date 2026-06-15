import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runInitCommand } from './init'

let currentTmpDir: string | null = null

function createTempProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-cli-init-'))
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

describe('init command', () => {
  it('creates project metadata and self skill with cache and staged', async () => {
    const cwd = createTempProject()
    vi.spyOn(console, 'info').mockImplementation(() => undefined)

    await runInitCommand({
      cwd,
      force: true,
    })

    expect(existsSync(join(cwd, '.agents/agent/airules.config.ts'))).toBe(true)
    expect(existsSync(join(cwd, '.agents/agent/airules.lock.json'))).toBe(true)
    expect(existsSync(join(cwd, '.agents/agent/staged'))).toBe(true)
    expect(existsSync(join(cwd, '.agents/agent/cache'))).toBe(true)
    expect(existsSync(join(cwd, '.agents/skills/airules/SKILL.md'))).toBe(true)
  })

  it('creates compact plain object config without defineConfig import', async () => {
    const cwd = createTempProject()

    await runInitCommand({
      cwd,
    })

    const config = await import('node:fs/promises').then(m =>
      m.readFile(join(cwd, '.agents/agent/airules.config.ts'), 'utf8'),
    )

    expect(config).toContain('export default')
    expect(config).toContain('packs: []')
    expect(config).not.toContain('registries:')
    expect(config).not.toContain('security:')
    expect(config).not.toContain('install:')

    const skill = await import('node:fs/promises').then(m =>
      m.readFile(join(cwd, '.agents/skills/airules/SKILL.md'), 'utf8'),
    )

    expect(skill).toContain('name: airules')
  })
})
