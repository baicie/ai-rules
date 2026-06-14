import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import process from 'node:process'
import { sha256 } from './hash'
import { loadLocalPack } from './pack-loader'
import { assertPackValid } from './pack-validator'
import {
  ensureParentDirectory,
  listTextFilesRecursively,
  readTextFile,
  safeResolveInside,
  toPosixPath,
} from './path-utils'
import { resolveLocalPackSource } from './source'

export interface BuildPackOptions {
  cwd?: string
  packPath: string
  outDir?: string
  clean?: boolean
}

export interface BuildPackFile {
  path: string
  hash: string
}

export interface BuildPackResult {
  outDir: string
  packName: string
  packVersion: string
  files: BuildPackFile[]
  hash: string
}

export function buildPack(options: BuildPackOptions): BuildPackResult {
  const cwd = options.cwd ?? process.cwd()
  assertPackValid({
    cwd,
    packPath: options.packPath,
  })

  const source = resolveLocalPackSource(options.packPath, cwd)
  const loaded = loadLocalPack(source)
  const outDir =
    options.outDir ??
    join(
      cwd,
      '.agents',
      'agent',
      'build',
      `${sanitizeFileName(loaded.pack.name)}-${loaded.pack.version}`,
    )

  const absoluteOutDir = safeResolveInside(cwd, outDir, 'build output')

  if (options.clean !== false && existsSync(absoluteOutDir)) {
    rmSync(absoluteOutDir, {
      recursive: true,
      force: true,
    })
  }

  mkdirSync(absoluteOutDir, {
    recursive: true,
  })

  const sourceFiles = listTextFilesRecursively(loaded.root)
  const files: BuildPackFile[] = []

  for (const sourceFile of sourceFiles) {
    const relativePath = toPosixPath(relative(loaded.root, sourceFile))
    const targetPath = safeResolveInside(
      absoluteOutDir,
      relativePath,
      'build file',
    )
    const content = readTextFile(sourceFile)

    ensureParentDirectory(targetPath)
    writeFileSync(targetPath, content)

    files.push({
      path: relativePath,
      hash: sha256(content),
    })
  }

  files.sort((a, b) => a.path.localeCompare(b.path))

  const manifest = {
    name: loaded.pack.name,
    version: loaded.pack.version,
    source: options.packPath,
    files,
    hash: hashBuildFiles(files),
  }

  writeFileSync(
    join(absoluteOutDir, 'airules.build.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )

  return {
    outDir: absoluteOutDir,
    packName: loaded.pack.name,
    packVersion: loaded.pack.version,
    files,
    hash: manifest.hash,
  }
}

function hashBuildFiles(files: BuildPackFile[]): string {
  return sha256(files.map(file => `${file.path}\0${file.hash}`).join('\0'))
}

function sanitizeFileName(value: string): string {
  const name = value.replace(/[^\w.-]/g, '_')
  return name || basename(value)
}
