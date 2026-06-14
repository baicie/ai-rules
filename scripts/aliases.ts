// these aliases are shared between vitest and build tooling
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packagesDir = fileURLToPath(new URL('../packages/', import.meta.url))

function resolveEntryForPkg(dir: string): string {
  return path.resolve(packagesDir, dir, 'src/index.ts')
}

function readPackageName(dir: string): string | null {
  const packageJsonPath = path.resolve(packagesDir, dir, 'package.json')

  if (!existsSync(packageJsonPath)) {
    return null
  }

  const raw = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    name?: unknown
  }

  return typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : null
}

const entries: Record<string, string> = {}

for (const dir of readdirSync(packagesDir)) {
  const packageDir = path.resolve(packagesDir, dir)

  if (!statSync(packageDir).isDirectory()) {
    continue
  }

  const entry = resolveEntryForPkg(dir)

  if (!existsSync(entry)) {
    continue
  }

  const packageName = readPackageName(dir)

  if (packageName === null) {
    continue
  }

  entries[packageName] = entry
}

export { entries }
