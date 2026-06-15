# Registry

A registry maps friendly pack names and aliases to real sources.

## registry.json

```json
{
  "$schema": "https://baicie.github.io/airules/schema/registry.schema.json",
  "name": "@baicie/default",
  "version": "0.1.0",
  "packs": [
    {
      "name": "@baicie/react-shadcn",
      "source": "github:baicie/ai-rules/packs/react-shadcn#v0.1.0",
      "version": "0.1.0",
      "description": "React + shadcn/ui AI coding rules",
      "tags": ["react", "shadcn"],
      "aliases": ["shadcn", "react-shadcn"]
    }
  ]
}
```

## Search

```bash
airules search shadcn
```

## Add by alias

```bash
airules add shadcn --agent codex,cursor
```

## Publish to registry

```bash
airules registry publish ./packs/react-shadcn \
  --registry ./registry.json \
  --source github:baicie/ai-rules/packs/react-shadcn#v0.1.0 \
  --alias shadcn,react-shadcn \
  --tag react,shadcn
```

## Default registry

If config does not specify registries, airules uses:

```txt
github:baicie/ai-rules/registry.json#main
```

## Repository shorthand

When a GitHub repository contains a registry with `defaultPack`, the
repository shorthand resolves to that default pack:

```bash
airules add baicie/ai-rules
airules add baicie/ai-rules#main
airules add baicie/ai-rules#v0.1.0
airules add https://github.com/baicie/ai-rules
```

Resolution order for `github:owner/repo#ref`:

1. `airules.pack.json` at the repository root.
2. `registry.json` with `defaultPack` set (the default pack source must point
   to a path inside the same repository).
3. Exactly one `packs/*/airules.pack.json` directory.

If none of these match and the repository has multiple packs, airules asks
the user to specify the pack path explicitly:

```bash
airules add baicie/ai-rules/packs/react-shadcn
```

Mark a pack as the registry default during publish:

```bash
airules registry publish ./packs/react-shadcn \
  --registry ./registry.json \
  --source github:baicie/ai-rules/packs/react-shadcn#v0.1.0 \
  --default
```
