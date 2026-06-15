import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createAirulesSelfSkillContent,
  createCompactDefaultConfigContent,
  ensureAirulesProject,
} from './project-bootstrap'

let currentTmpDir: string | null = null

function createTempProject(): string {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-bootstrap-'))
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

describe('project bootstrap', () => {
  it('creates compact config, lockfile, cache, staged, and self skill', () => {
    const cwd = createTempProject()

    const result = ensureAirulesProject({
      cwd,
    })

    expect(result.created.length).toBeGreaterThan(0)
    expect(existsSync(join(cwd, '.agents/agent/airules.config.ts'))).toBe(true)
    expect(existsSync(join(cwd, '.agents/agent/airules.lock.json'))).toBe(true)
    expect(existsSync(join(cwd, '.agents/agent/cache'))).toBe(true)
    expect(existsSync(join(cwd, '.agents/agent/staged'))).toBe(true)
    expect(existsSync(join(cwd, '.agents/skills/airules/SKILL.md'))).toBe(true)

    const config = readFileSync(
      join(cwd, '.agents/agent/airules.config.ts'),
      'utf8',
    )

    expect(config).toContain('export default')
    expect(config).toContain('packs: []')
    expect(config).not.toContain('registries:')
    expect(config).not.toContain('security:')
  })

  it('skips existing files by default', () => {
    const cwd = createTempProject()

    ensureAirulesProject({
      cwd,
    })

    const result = ensureAirulesProject({
      cwd,
    })

    expect(result.skipped).toContain(
      join(cwd, '.agents/agent/airules.config.ts'),
    )
    expect(result.skipped).toContain(
      join(cwd, '.agents/agent/airules.lock.json'),
    )
    expect(result.skipped).toContain(
      join(cwd, '.agents/skills/airules/SKILL.md'),
    )
  })

  it('can skip config and lockfile but still create self skill', () => {
    const cwd = createTempProject()

    ensureAirulesProject({
      cwd,
      writeConfig: false,
      writeLockfile: false,
      writeSelfSkill: true,
    })

    expect(existsSync(join(cwd, '.agents/agent/airules.config.ts'))).toBe(false)
    expect(existsSync(join(cwd, '.agents/agent/airules.lock.json'))).toBe(false)
    expect(existsSync(join(cwd, '.agents/skills/airules/SKILL.md'))).toBe(true)
  })

  it('renders default config content', () => {
    expect(createCompactDefaultConfigContent()).toContain('export default')
    expect(createCompactDefaultConfigContent()).toContain('packs: []')
  })

  it('renders self skill content', () => {
    expect(createAirulesSelfSkillContent()).toContain('name: airules')
  })
})
