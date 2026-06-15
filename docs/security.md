# Security

AI rules affect coding agent behavior, so airules treats rule packs as supply-chain inputs.

## Defaults

- Do not execute scripts.
- Preserve user content outside managed blocks.
- Track generated content hashes in lockfile.
- Warn for untrusted sources.
- Prefer pinned GitHub refs or npm versions.

## Trusted sources

```ts
export default {
  security: {
    trustedSources: ['github:baicie/ai-rules', 'npm:@baicie/*'],
  },
}
```

## Pinned sources

Preferred:

```txt
github:baicie/ai-rules/packs/react-shadcn#v0.1.0
npm:@baicie/airules-react-shadcn@0.1.0
```

Avoid for reproducible installs:

```txt
github:baicie/ai-rules/packs/react-shadcn#main
npm:@baicie/airules-react-shadcn
```

## npm tarballs

npm tarballs are extracted into cache. Extraction must reject unsafe entries such as path traversal and links.

## Lockfile

The lockfile records:

- pack name
- source
- resolved metadata
- content hashes
- generated targets
