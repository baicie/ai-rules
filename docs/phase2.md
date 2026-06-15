# Phase 2 Design

## Goal

Phase 2 adds GitHub source support to the local module installer.

Phase 1 supports only local packs. Phase 2 supports:

```txt
owner/repo/path#ref
https://github.com/owner/repo/tree/ref/path
```

The explicit `github:owner/repo/path#ref` protocol remains supported for
backward compatibility.

The GitHub pack is downloaded into:

```txt
~/.cache/airules/packs/github/<owner>/<repo>/<commit>/<pathHash>
```

Set `AIRULES_CACHE_DIR` to override the global cache directory.

Then the existing local pack loader installs it from cache.

## Supported

- GitHub source parsing
- default branch resolution
- commit resolution
- recursive tree download
- blob download
- global cache write
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
airules add baicie/ai-rules/packs/react-shadcn#v0.1.0 --agent codex
airules add baicie/ai-rules/packs/react-shadcn#main --agent codex
airules add https://github.com/baicie/ai-rules/tree/main/packs/react-shadcn --agent codex
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
baicie/ai-rules/packs/react-shadcn
```

Use:

```txt
baicie/ai-rules/packs/react-shadcn#v0.1.0
```

or:

```txt
baicie/ai-rules/packs/react-shadcn#<commit>
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
