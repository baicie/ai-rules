# Phase 5 Design

## Goal

Phase 5 adds registry and named pack alias support.

Before Phase 5:

```bash
airules add baicie/ai-rules/packs/react-shadcn#v0.1.0
```

After Phase 5:

```bash
airules add @baicie/react-shadcn
airules add shadcn
airules search shadcn
airules registry list
```

## Registry file

```json
{
  "name": "@baicie/default",
  "version": "0.1.0",
  "packs": [
    {
      "name": "@baicie/react-shadcn",
      "source": "github:baicie/ai-rules/packs/react-shadcn#v0.1.0",
      "version": "0.1.0",
      "description": "React + shadcn/ui AI coding rules",
      "tags": ["react", "shadcn"],
      "aliases": ["react-shadcn", "shadcn"]
    }
  ]
}
```

## Config

```ts
export default {
  version: 1,
  registries: [
    {
      name: 'default',
      source: 'github:baicie/ai-rules/registry.json#main',
    },
  ],
  packs: [],
}
```

## Commands

```bash
airules search
airules search shadcn
airules registry list
airules add @baicie/react-shadcn
airules add shadcn
airules add shadcn --registry ./registry.json
```

## Source resolution

Direct sources are installed as-is:

```txt
./packs/react-shadcn
local:./packs/react-shadcn
baicie/ai-rules/packs/react-shadcn#v0.1.0
```

Named sources are resolved from registries:

```txt
@baicie/react-shadcn
react-shadcn
shadcn
```

## Security

Security checks are applied to the resolved pack source, not the alias.

For example:

```bash
airules add shadcn
```

If `shadcn` resolves to:

```txt
baicie/ai-rules/packs/react-shadcn#v0.1.0
```

Then `security.requirePinnedVersion` and `security.trustedSources` are checked against that GitHub source.

## Config writeback

When adding from alias, config stores the resolved source:

```json
{
  "name": "@baicie/react-shadcn",
  "source": "github:baicie/ai-rules/packs/react-shadcn#v0.1.0"
}
```

This makes future `airules update` independent from registry availability.
