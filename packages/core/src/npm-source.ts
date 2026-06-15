import type { AirulesResolvedSource } from '@baicie/airules-schema'
import { Buffer } from 'node:buffer'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import * as tar from 'tar'
import { getAirulesPackCacheDir } from './cache-path'

export interface ParsedNpmSource {
  packageName: string
  version?: string
}

export interface ResolvedNpmPackSource {
  source: string
  root: string
  resolved: Extract<AirulesResolvedSource, { type: 'npm' }>
}

interface NpmPackageMetadata {
  name: string
  'dist-tags'?: Record<string, string>
  versions?: Record<string, NpmPackageVersion>
}

interface NpmPackageVersion {
  version: string
  dist?: {
    tarball?: string
    integrity?: string
    shasum?: string
  }
}

export function isNpmSource(source: string): boolean {
  return source.startsWith('npm:')
}

export function parseNpmSource(source: string): ParsedNpmSource {
  if (!source.startsWith('npm:')) {
    throw new Error(`Invalid npm source "${source}". Expected npm:...`)
  }

  const body = source.slice('npm:'.length).trim()

  if (body.length === 0) {
    throw new Error('npm source cannot be empty.')
  }

  const atIndex = findVersionAtIndex(body)

  if (atIndex === -1) {
    return {
      packageName: body,
    }
  }

  const packageName = body.slice(0, atIndex)
  const version = body.slice(atIndex + 1)

  if (packageName.length === 0) {
    throw new Error(`Invalid npm source "${source}". Missing package name.`)
  }

  if (version.length === 0) {
    throw new Error(`Invalid npm source "${source}". Missing version.`)
  }

  return {
    packageName,
    version,
  }
}

export async function resolveNpmPackSource(
  source: string,
  cwd = process.cwd(),
): Promise<ResolvedNpmPackSource> {
  const parsed = parseNpmSource(source)
  const metadata = await fetchNpmMetadata(parsed.packageName)
  const version = resolveNpmVersion(metadata, parsed.version)
  const packageVersion = metadata.versions?.[version]

  if (!packageVersion) {
    throw new Error(
      `Cannot find npm package "${parsed.packageName}" version "${version}".`,
    )
  }

  const tarball = packageVersion.dist?.tarball

  if (!tarball) {
    throw new Error(
      `Cannot find npm tarball for "${parsed.packageName}@${version}".`,
    )
  }

  const cacheRoot = getNpmPackCacheRoot(cwd, {
    packageName: parsed.packageName,
    version,
  })

  await downloadNpmTarballToCache({
    tarball,
    cacheRoot,
  })

  const packFilePath = join(cacheRoot, 'airules.pack.json')
  if (!existsSync(packFilePath)) {
    throw new Error(
      `npm package "${parsed.packageName}@${version}" does not contain airules.pack.json at package root.`,
    )
  }

  return {
    source,
    root: cacheRoot,
    resolved: {
      type: 'npm',
      packageName: parsed.packageName,
      version,
    },
  }
}

export function getNpmPackCacheRoot(
  cwd: string,
  options: {
    packageName: string
    version: string
  },
): string {
  void cwd

  return join(
    getAirulesPackCacheDir(),
    'npm',
    sanitizePathSegment(options.packageName),
    sanitizePathSegment(options.version),
  )
}

async function fetchNpmMetadata(
  packageName: string,
): Promise<NpmPackageMetadata> {
  const encodedName = encodeNpmPackageName(packageName)
  const response = await fetch(`https://registry.npmjs.org/${encodedName}`, {
    headers: createNpmHeaders(),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `npm registry request failed: ${response.status} ${response.statusText}${body ? `\n${body}` : ''}`,
    )
  }

  return (await response.json()) as NpmPackageMetadata
}

function resolveNpmVersion(
  metadata: NpmPackageMetadata,
  requestedVersion: string | undefined,
): string {
  if (requestedVersion !== undefined) {
    return requestedVersion
  }

  const latest = metadata['dist-tags']?.latest

  if (latest === undefined || latest.length === 0) {
    throw new Error(`Cannot resolve latest version for "${metadata.name}".`)
  }

  return latest
}

async function downloadNpmTarballToCache(options: {
  tarball: string
  cacheRoot: string
}): Promise<void> {
  const response = await fetch(options.tarball, {
    headers: createNpmHeaders(),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `npm tarball request failed: ${response.status} ${response.statusText}${body ? `\n${body}` : ''}`,
    )
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  if (existsSync(options.cacheRoot)) {
    rmSync(options.cacheRoot, {
      recursive: true,
      force: true,
    })
  }

  mkdirSync(options.cacheRoot, {
    recursive: true,
  })

  const tarballPath = join(options.cacheRoot, 'package.tgz')
  writeFileSync(tarballPath, buffer)

  await tar.x({
    file: tarballPath,
    cwd: options.cacheRoot,
    strip: 1,
    filter: (entryPath, entry) => {
      const entryType = 'type' in entry ? String(entry.type) : ''
      return isSafeTarEntry(options.cacheRoot, entryPath, entryType)
    },
  })

  rmSync(tarballPath, {
    force: true,
  })
}

function isSafeTarEntry(
  cacheRoot: string,
  entryPath: string,
  entryType: string,
): boolean {
  if (
    entryType !== 'File' &&
    entryType !== 'Directory' &&
    entryType !== 'OldFile'
  ) {
    return false
  }

  const stripped = stripFirstSegment(entryPath)

  if (stripped.length === 0) {
    return true
  }

  const parts = stripped.split(/[\\/]/)
  if (parts.includes('..') || isAbsolute(stripped)) {
    return false
  }

  const target = resolve(cacheRoot, stripped)
  const relativePath = relative(cacheRoot, target)

  return (
    relativePath.length > 0 &&
    !relativePath.startsWith('..') &&
    !isAbsolute(relativePath)
  )
}

function stripFirstSegment(value: string): string {
  return value.replace(/\\/g, '/').split('/').slice(1).join('/')
}

function createNpmHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'user-agent': 'airules',
  }

  const token = process.env.NPM_TOKEN

  if (token !== undefined && token.length > 0) {
    headers.authorization = `Bearer ${token}`
  }

  return headers
}

function encodeNpmPackageName(packageName: string): string {
  return packageName.replace('/', '%2F')
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^\w.-]/g, '_')
}

function findVersionAtIndex(value: string): number {
  if (value.startsWith('@')) {
    const slashIndex = value.indexOf('/')

    if (slashIndex === -1) {
      throw new Error(
        `Invalid scoped npm package "${value}". Expected @scope/name.`,
      )
    }

    return value.indexOf('@', slashIndex + 1)
  }

  return value.lastIndexOf('@')
}
