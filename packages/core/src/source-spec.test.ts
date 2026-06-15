import { describe, expect, it } from 'vitest'
import {
  isAgentMdSnippetSource,
  isDirectPackSourceInput,
  normalizePackSourceInput,
  toAgentMdSnippetFileSource,
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

  it('normalizes github repository shorthand', () => {
    expect(normalizePackSourceInput('baicie/ai-rules')).toBe(
      'github:baicie/ai-rules',
    )

    expect(normalizePackSourceInput('baicie/ai-rules#main')).toBe(
      'github:baicie/ai-rules#main',
    )

    expect(normalizePackSourceInput('baicie/ai-rules#v0.1.0')).toBe(
      'github:baicie/ai-rules#v0.1.0',
    )
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
    expect(normalizePackSourceInput('agents/code-splitting.md')).toBe(
      'agents/code-splitting.md',
    )
  })

  it('passes through invalid agents sources without throwing', () => {
    expect(normalizePackSourceInput('agents')).toBe('agents')
    expect(normalizePackSourceInput('agents/')).toBe('agents/')
    expect(normalizePackSourceInput('agents/foo/bar')).toBe('agents/foo/bar')
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

  it('treats agents/ prefixes as direct local sources', () => {
    expect(isDirectPackSourceInput('agents/code-splitting')).toBe(true)
    expect(isDirectPackSourceInput('agents')).toBe(true)
    expect(isDirectPackSourceInput('agents/')).toBe(true)
    expect(isDirectPackSourceInput('agents/foo/bar')).toBe(true)
  })
})

describe('isAgentMdSnippetSource', () => {
  it('accepts one-segment agent snippets', () => {
    expect(isAgentMdSnippetSource('agents/code-splitting')).toBe(true)
    expect(isAgentMdSnippetSource('agents/code-splitting.md')).toBe(true)
  })

  it('rejects directory and traversal inputs', () => {
    expect(isAgentMdSnippetSource('agents')).toBe(false)
    expect(isAgentMdSnippetSource('agents/')).toBe(false)
    expect(isAgentMdSnippetSource('agents/foo/bar')).toBe(false)
    expect(isAgentMdSnippetSource('agents/../secret')).toBe(false)
  })

  it('rejects backslash path traversal', () => {
    expect(isAgentMdSnippetSource('agents/..\\secret')).toBe(false)
  })

  it('rejects dots-only segments', () => {
    expect(isAgentMdSnippetSource('agents/.')).toBe(false)
    expect(isAgentMdSnippetSource('agents/..')).toBe(false)
  })
})

describe('toAgentMdSnippetFileSource', () => {
  it('adds .md when omitted', () => {
    expect(toAgentMdSnippetFileSource('agents/code-splitting')).toBe(
      'agents/code-splitting.md',
    )
  })

  it('keeps explicit .md', () => {
    expect(toAgentMdSnippetFileSource('agents/code-splitting.md')).toBe(
      'agents/code-splitting.md',
    )
  })

  it('throws for non-agentmd sources', () => {
    expect(() => toAgentMdSnippetFileSource('docs/rules')).toThrow(
      /Invalid AgentMD/,
    )
  })
})
