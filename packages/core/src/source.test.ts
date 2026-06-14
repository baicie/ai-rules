import { sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { resolveLocalPackSource } from './source'

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

  it('resolves file: absolute source', () => {
    const absolutePath = `${process.cwd()}${sep}absolute${sep}path${sep}to${sep}pack`
    const fileUrl = pathToFileURL(absolutePath).href
    const result = resolveLocalPackSource(fileUrl, '/repo')

    expect(result.root).toBe(absolutePath)
  })

  it('rejects github source in Phase 1', () => {
    expect(() =>
      resolveLocalPackSource('github:baicie/ai-rules/packs/react-shadcn'),
    ).toThrow(/github source is not supported in Phase 1/)
  })

  it('rejects npm source in Phase 1', () => {
    expect(() => resolveLocalPackSource('npm:@baicie/react-shadcn')).toThrow(
      /npm source is not supported in Phase 1/,
    )
  })

  it('rejects http source in Phase 1', () => {
    expect(() =>
      resolveLocalPackSource('https://example.com/pack.json'),
    ).toThrow(/http source is not supported in Phase 1/)
  })
})
