# airules Config

Config lives under:

```txt
.agents/agent/airules.config.ts
```

## Minimal config

```ts
export default {
  packs: [],
}
```

## Add packs

```ts
export default {
  packs: [
    {
      name: '@baicie/react-shadcn',
      source: 'shadcn',
      agents: ['codex', 'cursor', 'skill'],
    },
  ],
}
```

## Full config

```ts
export default {
  registries: [
    {
      name: 'company',
      source: './registry.json',
    },
  ],
  packs: [
    {
      name: '@baicie/react-shadcn',
      source: 'shadcn',
      profile: 'strict',
      agents: ['codex', 'cursor'],
      variables: {
        packageManager: 'pnpm',
      },
    },
  ],
  install: {
    conflict: 'stage',
  },
  security: {
    trustedSources: ['github:baicie/ai-rules'],
    requirePinnedVersion: true,
  },
}
```

## Defaults

If omitted:

- `version` defaults to `1`.
- `packs` defaults to `[]`.
- registry fallback is `github:baicie/ai-rules/registry.json#main`.
- scripts are not allowed by default.
- pinned version is recommended but not required by default.

## Lookup order

```txt
airules.config.ts
airules.config.mts
airules.config.cts
airules.config.js
airules.config.mjs
airules.config.cjs
airules.config.json
```
