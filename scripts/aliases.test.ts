import { existsSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { entries } from './aliases'

describe('scripts/aliases', () => {
  it('maps workspace package names to source entries', () => {
    expect(entries['@baicie/airules-schema']).toMatch(
      /packages[\\/]schema[\\/]src[\\/]index\.ts$/,
    )
    expect(entries['@baicie/airules-core']).toMatch(
      /packages[\\/]core[\\/]src[\\/]index\.ts$/,
    )
    expect(entries['@baicie/airules']).toMatch(
      /packages[\\/]cli[\\/]src[\\/]index\.ts$/,
    )
  })

  it('resolves every entry to an existing source file', () => {
    for (const entry of Object.values(entries)) {
      expect(existsSync(entry)).toBe(true)
      expect(statSync(entry).isFile()).toBe(true)
    }
  })
})
