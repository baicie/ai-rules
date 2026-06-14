import { describe, expect, it } from 'vitest'
import { assertInsideDirectory, safeResolveInside } from './path-utils'

describe('path-utils', () => {
  it('resolves safe child path', () => {
    const result = safeResolveInside('/repo', 'docs/ai/rules.md')
    expect(result).toMatch(/[\\/]repo[\\/]docs[\\/]ai[\\/]rules\.md$/)
  })

  it('rejects parent traversal', () => {
    expect(() => safeResolveInside('/repo', '../evil.md')).toThrow(
      /outside root/,
    )
  })

  it('rejects exact root as file target', () => {
    expect(() => assertInsideDirectory('/repo', '/repo')).toThrow(
      /outside root/,
    )
  })
})
