import { describe, expect, it } from 'vitest'
import {
  hasPinnedGitHubRef,
  isTrustedSource,
  validateSourceSecurity,
} from './security'

describe('security', () => {
  it('detects pinned github ref', () => {
    expect(
      hasPinnedGitHubRef('github:baicie/ai-rules/packs/react-shadcn#v0.1.0'),
    ).toBe(true)

    expect(
      hasPinnedGitHubRef('github:baicie/ai-rules/packs/react-shadcn'),
    ).toBe(false)
  })

  it('throws when pinned version is required', () => {
    expect(() =>
      validateSourceSecurity('github:baicie/ai-rules/packs/react-shadcn', {
        requirePinnedVersion: true,
      }),
    ).toThrow(/is not pinned/)
  })

  it('returns warning for untrusted source', () => {
    const result = validateSourceSecurity('github:someone/rules/packs/react', {
      trustedSources: ['github:baicie/ai-rules'],
    })

    expect(result.warnings).toEqual([
      'Source "github:someone/rules/packs/react" is not listed in security.trustedSources.',
    ])
  })

  it('matches trusted source by prefix', () => {
    expect(
      isTrustedSource('github:baicie/ai-rules/packs/react-shadcn#v0.1.0', [
        'github:baicie/ai-rules',
      ]),
    ).toBe(true)
  })
})
