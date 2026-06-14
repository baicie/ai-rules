import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveLocalPackSource, resolvePackSource } from './source'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveLocalPackSource', () => {
  it('resolves relative local source', () => {
    const result = resolveLocalPackSource('./packs/react-shadcn', '/repo')

    expect(result.source).toBe('./packs/react-shadcn')
    expect(result.root).toMatch(/[\\/]repo[\\/]packs[\\/]react-shadcn$/)
    expect(result.resolved.type).toBe('local')
  })

  it('resolves local: source', () => {
    const result = resolveLocalPackSource('local:./packs/react-shadcn', '/repo')

    expect(result.root).toMatch(/[\\/]repo[\\/]packs[\\/]react-shadcn$/)
  })

  it('tells callers to use resolvePackSource for github source', () => {
    expect(() =>
      resolveLocalPackSource('github:baicie/ai-rules/packs/react-shadcn'),
    ).toThrow(/Use resolvePackSource/)
  })

  it('rejects npm source in Phase 2', () => {
    expect(() => resolveLocalPackSource('npm:@baicie/react-shadcn')).toThrow(
      /npm source is not supported in Phase 2/,
    )
  })
})

describe('resolvePackSource', () => {
  it('delegates local sources to local resolver', () => {
    return resolvePackSource('./packs/react-shadcn', '/repo').then(result => {
      expect(result.resolved.type).toBe('local')
    })
  })
})
