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
