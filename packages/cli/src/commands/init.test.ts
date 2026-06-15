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
  it('creates project metadata without project-local remote cache or state', async () => {
    const cwd = createTempProject()
    vi.spyOn(console, 'info').mockImplementation(() => undefined)

    await runInitCommand({
      cwd,
      force: true,
    })

    expect(existsSync(join(cwd, '.agents/agent/airules.config.ts'))).toBe(true)
    expect(existsSync(join(cwd, '.agents/agent/airules.lock.json'))).toBe(true)
    expect(existsSync(join(cwd, '.agents/agent/staged'))).toBe(true)
    expect(existsSync(join(cwd, '.agents/agent/cache'))).toBe(false)
    expect(existsSync(join(cwd, '.agents/agent/state.json'))).toBe(false)
  })
})
