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
node packages/cli/dist/bin.js pack-validate ./packs/react-shadcn
node packages/cli/dist/bin.js pack-build ./packs/react-shadcn --out dist/airules/react-shadcn
```

## Registry validation

```bash
node packages/cli/dist/bin.js registries --registry ./registry.json
node packages/cli/dist/bin.js search shadcn --registry ./registry.json
```

## Local dogfood

```bash
mkdir -p temp/dogfood
cd temp/dogfood

node ../../packages/cli/dist/bin.js init --force
node ../../packages/cli/dist/bin.js add ../../packs/react-shadcn --agent codex,cursor,skill
node ../../packages/cli/dist/bin.js doctor
node ../../packages/cli/dist/bin.js diff
node ../../packages/cli/dist/bin.js remove @baicie/react-shadcn --dry-run
```

## Expected files

```txt
AGENTS.md
.cursor/rules/shadcn.mdc
.github/copilot-instructions.md
.agents/skills/shadcn-page/SKILL.md
.agents/agent/airules.config.ts
.agents/agent/airules.lock.json
```

## Publish beta

```bash
pnpm build
pnpm --filter @baicie/airules publish --tag beta --access public
```
