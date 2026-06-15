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

  it('tells callers to use resolvePackSource for npm source', () => {
    expect(() => resolveLocalPackSource('npm:@baicie/react-shadcn')).toThrow(
      /Use resolvePackSource/,
    )
  })
})

describe('resolvePackSource', () => {
  it('delegates local sources to local resolver', () => {
    return resolvePackSource('./packs/react-shadcn', '/repo').then(result => {
      expect(result.resolved.type).toBe('local')
    })
  })

  it('delegates npm sources to npm resolver', async () => {
    const npmSource = await import('./npm-source')
    const spy = vi.spyOn(npmSource, 'resolveNpmPackSource').mockResolvedValue({
      source: 'npm:@baicie/pkg',
      root: '/cache/airules/packs/npm/_baicie_pkg/0.1.0',
      resolved: { type: 'npm', packageName: '@baicie/pkg', version: '0.1.0' },
    })

    const result = await resolvePackSource('npm:@baicie/pkg', '/repo')
    expect(spy).toHaveBeenCalledWith('npm:@baicie/pkg', '/repo')
    expect(result.resolved.type).toBe('npm')
    spy.mockRestore()
  })

  it('normalizes npm package specs before resolving', async () => {
    const npmSource = await import('./npm-source')
    const spy = vi.spyOn(npmSource, 'resolveNpmPackSource').mockResolvedValue({
      source: 'npm:@baicie/pkg@0.1.0',
      root: '/cache/airules/packs/npm/_baicie_pkg/0.1.0',
      resolved: { type: 'npm', packageName: '@baicie/pkg', version: '0.1.0' },
    })

    await resolvePackSource('@baicie/pkg@0.1.0', '/repo')
    expect(spy).toHaveBeenCalledWith('npm:@baicie/pkg@0.1.0', '/repo')
    spy.mockRestore()
  })
})
