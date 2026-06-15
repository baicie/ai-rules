# Phase 6 Design

## Goal

Phase 6 adds npm source support and pack publishing workflow.

## Supported

```txt
npm source
pack validate
pack build
registry publish
```

## npm source

```bash
airules add @baicie/airules-react-shadcn@0.1.0
airules add airules-react-shadcn@latest
```

The explicit `npm:` protocol remains supported for backward compatibility.

Resolution:

```txt
1. Read npm metadata from registry.npmjs.org.
2. Resolve latest or exact version.
3. Download tarball.
4. Extract into the global cache under `~/.cache/airules/packs/npm`.
5. Load airules.pack.json from extracted package root.
```

## pack validate

```bash
airules pack validate ./packs/react-shadcn
```

Checks:

```txt
airules.pack.json schema
duplicate install id
module id exists
module file exists
template file exists
block id exists
block file exists
file source exists
directory source exists
```

## pack build

```bash
airules pack build ./packs/react-shadcn --out dist/airules/react-shadcn
```

Build output:

```txt
dist/airules/react-shadcn/
├── airules.pack.json
├── modules/
├── blocks/
├── templates/
├── files/
├── skills/
└── airules.build.json
```

## registry publish

```bash
airules registry-publish ./packs/react-shadcn \
  --registry ./registry.json \
  --source github:baicie/ai-rules/packs/react-shadcn#v0.1.0 \
  --alias shadcn,react-shadcn \
  --tag react,shadcn
```

This updates local `registry.json`.

It does not run `npm publish`.

## npm package layout

An npm airules pack should contain:

```txt
package/
├── package.json
├── airules.pack.json
├── modules/
├── blocks/
├── templates/
├── files/
└── skills/
```

After extraction with `strip: 1`, `airules.pack.json` must be at cache root.
