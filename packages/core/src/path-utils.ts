import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { AIRULES_AGENT_DIR, AIRULES_STAGED_DIRNAME } from './constants'

export function safeResolveInside(
  root: string,
  childPath: string,
  label = 'path',
): string {
  const resolvedRoot = resolve(root)
  const resolvedTarget = resolve(resolvedRoot, childPath)
  assertInsideDirectory(resolvedRoot, resolvedTarget, label)
  return resolvedTarget
}

export function safeResolveTarget(cwd: string, target: string): string {
  return safeResolveInside(cwd, target, 'target')
}

export function assertInsideDirectory(
  root: string,
  target: string,
  label = 'path',
): void {
  const resolvedRoot = resolve(root)
  const resolvedTarget = resolve(target)
  const relativePath = relative(resolvedRoot, resolvedTarget)

  if (
    relativePath === '' ||
    relativePath.startsWith('..') ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Refusing to access ${label} outside root: ${target}`)
  }
}

export function ensureParentDirectory(filePath: string): void {
  mkdirSync(dirname(filePath), {
    recursive: true,
  })
}

export function readTextFile(filePath: string): string {
  return readFileSync(filePath, 'utf8')
}

export function listTextFilesRecursively(root: string): string[] {
  if (!existsSync(root)) {
    throw new Error(`Directory does not exist: ${root}`)
  }

  const result: string[] = []

  function walk(current: string): void {
    const entries = readdirSync(current)

    for (const entry of entries) {
      const absolutePath = join(current, entry)
      const stat = statSync(absolutePath)

      if (stat.isDirectory()) {
        walk(absolutePath)
        continue
      }

      if (stat.isFile()) {
        result.push(absolutePath)
      }
    }
  }

  walk(root)
  result.sort()
  return result
}

export function toPosixPath(value: string): string {
  return value.split(sep).join('/')
}

export function joinTarget(base: string, relativePath: string): string {
  return toPosixPath(join(base, relativePath))
}

export function getManualStagedPath(options: {
  cwd: string
  pack: string
  installId: string
  target: string
}): string {
  const safePack = sanitizeSegment(options.pack)
  const safeInstall = sanitizeSegment(options.installId)

  return safeResolveInside(
    options.cwd,
    join(
      AIRULES_AGENT_DIR,
      AIRULES_STAGED_DIRNAME,
      safePack,
      safeInstall,
      options.target,
    ),
    'staged target',
  )
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^\w.-]/g, '_')
}
