import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { isCliEntry } from './bin'

let currentTmpDir: string | null = null

function createLinkScenario(): { realFile: string; symlink: string } {
  currentTmpDir = mkdtempSync(join(tmpdir(), 'airules-cli-entry-'))
  const realFile = join(currentTmpDir, 'bin.js')
  writeFileSync(realFile, '// stub')
  const symlink = join(currentTmpDir, 'bin-link.js')
  symlinkSync(realFile, symlink)
  return { realFile, symlink }
}

afterEach(() => {
  if (currentTmpDir) {
    rmSync(currentTmpDir, { recursive: true, force: true })
    currentTmpDir = null
  }
})

describe('isCliEntry', () => {
  it('returns false when argv1 is missing (library import)', () => {
    const metaUrl = pathToFileURL('/some/path/bin.js').href
    expect(isCliEntry(metaUrl, undefined)).toBe(false)
  })

  it('returns false when metaUrl is missing (cjs bundle)', () => {
    expect(isCliEntry(undefined, '/some/path/bin.js')).toBe(false)
  })

  it('returns true when argv1 is the exact same file as the module', () => {
    const { realFile } = createLinkScenario()
    const metaUrl = pathToFileURL(realFile).href
    expect(isCliEntry(metaUrl, realFile)).toBe(true)
  })

  it('returns true when argv1 is a symlink pointing to the module (n install scenario)', () => {
    const { realFile, symlink } = createLinkScenario()
    const metaUrl = pathToFileURL(realFile).href
    expect(isCliEntry(metaUrl, symlink)).toBe(true)
  })

  it('returns false when argv1 points to a different file', () => {
    const { realFile } = createLinkScenario()
    const metaUrl = pathToFileURL(realFile).href
    const otherFile = join(currentTmpDir as string, 'other.js')
    writeFileSync(otherFile, '// stub')
    expect(isCliEntry(metaUrl, otherFile)).toBe(false)
  })
})
