import { describe, expect, it } from 'vitest'
import {
  isDirectPackSourceInput,
  normalizePackSourceInput,
} from './source-spec'

describe('normalizePackSourceInput', () => {
  it('keeps explicit protocol sources unchanged', () => {
    expect(
      normalizePackSourceInput('github:baicie/ai-rules/packs/react-shadcn#v1'),
    ).toBe('github:baicie/ai-rules/packs/react-shadcn#v1')

    expect(normalizePackSourceInput('npm:@baicie/pack@0.1.0')).toBe(
      'npm:@baicie/pack@0.1.0',
    )
  })

  it('normalizes github shorthand sources', () => {
    expect(
      normalizePackSourceInput('baicie/ai-rules/packs/react-shadcn#v0.1.0'),
    ).toBe('github:baicie/ai-rules/packs/react-shadcn#v0.1.0')
  })

  it('normalizes github tree urls', () => {
    expect(
      normalizePackSourceInput(
        'https://github.com/baicie/ai-rules/tree/v0.1.0/packs/react-shadcn',
      ),
    ).toBe('github:baicie/ai-rules/packs/react-shadcn#v0.1.0')
  })

  it('normalizes npm package specs with versions', () => {
    expect(normalizePackSourceInput('@baicie/airules-react-shadcn@0.1.0')).toBe(
      'npm:@baicie/airules-react-shadcn@0.1.0',
    )

    expect(normalizePackSourceInput('airules-react-shadcn@latest')).toBe(
      'npm:airules-react-shadcn@latest',
    )
  })

  it('keeps registry aliases as aliases', () => {
    expect(normalizePackSourceInput('shadcn')).toBe('shadcn')
    expect(normalizePackSourceInput('@baicie/react-shadcn')).toBe(
      '@baicie/react-shadcn',
    )
  })

  it('keeps agents snippets as local sources', () => {
    expect(normalizePackSourceInput('agents/code-splitting')).toBe(
      'agents/code-splitting',
    )
  })
})

describe('isDirectPackSourceInput', () => {
  it('treats normalized github and npm specs as direct sources', () => {
    expect(isDirectPackSourceInput('baicie/ai-rules/packs/react-shadcn')).toBe(
      true,
    )
    expect(isDirectPackSourceInput('@baicie/pack@0.1.0')).toBe(true)
  })

  it('keeps bare aliases non-direct', () => {
    expect(isDirectPackSourceInput('shadcn')).toBe(false)
  })

  it('treats agents snippets as direct local sources', () => {
    expect(isDirectPackSourceInput('agents/code-splitting')).toBe(true)
  })
})
