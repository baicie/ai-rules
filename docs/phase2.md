# Phase 2 Design

## Goal

Phase 2 adds GitHub source support to the local module installer.

Phase 1 supports only local packs. Phase 2 supports:

```txt
github:owner/repo/path#ref
```

The GitHub pack is downloaded into:

```txt
.agents/agent/cache/github/<owner>/<repo>/<commit>/<pathHash>
```

Then the existing local pack loader installs it from cache.

## Supported

- GitHub source parsing
- default branch resolution
- commit resolution
- recursive tree download
- blob download
- cache write
- lockfile commit recording
- `GITHUB_TOKEN` / `GH_TOKEN`
- `security.requirePinnedVersion`
- `security.trustedSources` warning

## Not supported yet

- npm source
- http tarball source
- template mode
- file mode
- directory mode
- remove
- registry search

## Examples

```bash
airules add github:baicie/ai-rules/packs/react-shadcn#v0.1.0 --agent codex
airules add github:baicie/ai-rules/packs/react-shadcn#main --agent codex
airules add github:baicie/ai-rules/packs/react-shadcn --agent codex
```

## Security

When config contains:

```ts
security: {
  requirePinnedVersion: true
}
```

This source is rejected:

```txt
github:baicie/ai-rules/packs/react-shadcn
```

Use:

```txt
github:baicie/ai-rules/packs/react-shadcn#v0.1.0
```

or:

```txt
github:baicie/ai-rules/packs/react-shadcn#<commit>
```

## GitHub API

Phase 2 uses:

```txt
GET /repos/{owner}/{repo}
GET /repos/{owner}/{repo}/commits/{ref}
GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=1
GET /repos/{owner}/{repo}/git/blobs/{sha}
```

## Auth

Set one of:

```bash
export GITHUB_TOKEN=...
export GH_TOKEN=...
```

## Lockfile

GitHub sources are locked as:

```json
{
  "type": "github",
  "owner": "baicie",
  "repo": "ai-rules",
  "path": "packs/react-shadcn",
  "ref": "v0.1.0",
  "commit": "abc123"
}
```
