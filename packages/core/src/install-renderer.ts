import type { AirulesInstall, AirulesPack } from '@baicie/airules-schema'
import { relative } from 'node:path'
import { sha256 } from './hash'
import { renderModules } from './module-renderer'
import {
  joinTarget,
  listTextFilesRecursively,
  readTextFile,
  safeResolveInside,
  toPosixPath,
} from './path-utils'
import { renderTemplate } from './template-renderer'

export interface RenderInstallOptions {
  pack: AirulesPack
  packRoot: string
  install: AirulesInstall
  variables?: Record<string, unknown>
}

export interface RenderedInstallFile {
  target: string
  content: string
  contentHash: string
  sourcePath?: string
}

export interface RenderedInstall {
  files: RenderedInstallFile[]
  modules?: string[]
  blocks?: string[]
  contentHash: string
}

export function renderInstall(options: RenderInstallOptions): RenderedInstall {
  switch (options.install.mode) {
    case 'modules':
      return renderModulesInstall(options)

    case 'template':
      return renderTemplateInstall(options)

    case 'file':
      return renderFileInstall(options)

    case 'directory':
      return renderDirectoryInstall(options)

    default: {
      const neverMode: never = options.install.mode
      throw new Error(`Unsupported install mode: ${String(neverMode)}`)
    }
  }
}

function renderModulesInstall(options: RenderInstallOptions): RenderedInstall {
  const rendered = renderModules({
    pack: options.pack,
    packRoot: options.packRoot,
    install: options.install,
  })

  const file = createRenderedFile(options.install.target, rendered.content)

  return {
    files: [file],
    modules: rendered.moduleIds,
    contentHash: hashFiles([file]),
  }
}

function renderTemplateInstall(options: RenderInstallOptions): RenderedInstall {
  const rendered = renderTemplate({
    pack: options.pack,
    packRoot: options.packRoot,
    install: options.install,
    variables: options.variables,
  })

  const file = createRenderedFile(options.install.target, rendered.content)

  return {
    files: [file],
    blocks: rendered.blockIds,
    contentHash: hashFiles([file]),
  }
}

function renderFileInstall(options: RenderInstallOptions): RenderedInstall {
  if (!options.install.from) {
    throw new Error(`Install "${options.install.id}" requires from.`)
  }

  const sourcePath = safeResolveInside(
    options.packRoot,
    options.install.from,
    'file',
  )
  const content = readTextFile(sourcePath)
  const file = createRenderedFile(options.install.target, content, sourcePath)

  return {
    files: [file],
    contentHash: hashFiles([file]),
  }
}

function renderDirectoryInstall(
  options: RenderInstallOptions,
): RenderedInstall {
  if (!options.install.from) {
    throw new Error(`Install "${options.install.id}" requires from.`)
  }

  const sourceRoot = safeResolveInside(
    options.packRoot,
    options.install.from,
    'directory',
  )

  const sourceFiles = listTextFilesRecursively(sourceRoot)
  const files: RenderedInstallFile[] = []

  for (const sourceFile of sourceFiles) {
    const relativePath = toPosixPath(relative(sourceRoot, sourceFile))
    const target = joinTarget(options.install.target, relativePath)
    files.push(createRenderedFile(target, readTextFile(sourceFile), sourceFile))
  }

  if (files.length === 0) {
    throw new Error(
      `Directory install "${options.install.id}" has no files under ${sourceRoot}.`,
    )
  }

  return {
    files,
    contentHash: hashFiles(files),
  }
}

function createRenderedFile(
  target: string,
  content: string,
  sourcePath?: string,
): RenderedInstallFile {
  const result: RenderedInstallFile = {
    target,
    content,
    contentHash: sha256(content),
  }
  if (sourcePath !== undefined) {
    result.sourcePath = sourcePath
  }
  return result
}

function hashFiles(files: RenderedInstallFile[]): string {
  const payload = files
    .map(file => `${file.target}\0${file.contentHash}`)
    .join('\0')

  return sha256(payload)
}
