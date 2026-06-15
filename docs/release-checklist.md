# Release Checklist

## Local validation

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check
```

## Pack validation

```bash
node packages/cli/dist/bin.js pack validate ./packs/react-shadcn
node packages/cli/dist/bin.js pack build ./packs/react-shadcn --out dist/airules/react-shadcn
```

## Registry validation

```bash
node packages/cli/dist/bin.js registry list --registry ./registry.json
node packages/cli/dist/bin.js search shadcn --registry ./registry.json
```

## Local dogfood

```bash
mkdir -p temp/dogfood
cd temp/dogfood

node ../../packages/cli/dist/bin.js init --force
node ../../packages/cli/dist/bin.js add ../../packs/react-shadcn --agent codex,copilot,skill
node ../../packages/cli/dist/bin.js doctor
node ../../packages/cli/dist/bin.js diff
node ../../packages/cli/dist/bin.js remove @baicie/react-shadcn --dry-run
```

## Expected files

```txt
AGENTS.md
.github/copilot-instructions.md
.agents/skills/shadcn-page/SKILL.md
.agents/agent/airules.config.ts
.agents/agent/airules.lock.json
```

## Release with @baicie/release

Prepare a beta release:

```bash
pnpm release 0.1.0-beta.0 --publish --yes
```

Prepare a stable release:

```bash
pnpm release 0.1.0 --publish --yes
```

Publish-only is for CI tag publishing:

```bash
pnpm release:publish 0.1.0-beta.0
```

## Required GitHub secret

```txt
NPM_TOKEN
```
