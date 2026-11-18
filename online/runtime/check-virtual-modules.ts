import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import modules from './virtual-modules.json' with { type: 'json' }

export const virtualModules = modules
const runtimeRoot = fileURLToPath(new URL('.', import.meta.url))

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const groups = await Promise.all(entries.map(async (entry) => {
    if (['node_modules', 'dist', '.git'].includes(entry.name))
      return []
    const file = resolve(directory, entry.name)
    if (entry.isDirectory())
      return sourceFiles(file)
    return /\.(?:vue|ts)$/.test(file) && !/\.(?:test|d)\.ts$/.test(file)
      ? [file]
      : []
  }))
  return groups.flat()
}

export async function checkVirtualModules(
  clientRoot = resolve(runtimeRoot, '../../packages/client'),
  implementations: Record<string, string> = virtualModules,
) {
  const imports = new Set<string>()
  for (const file of await sourceFiles(clientRoot)) {
    const source = await readFile(file, 'utf8')
    const scripts = file.endsWith('.vue')
      ? (() => {
          const { descriptor } = parse(source, { filename: file })
          return [descriptor.script?.content, descriptor.scriptSetup?.content].filter(Boolean) as string[]
        })()
      : [source]
    for (const script of scripts) {
      const ast = ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
      function visit(node: ts.Node) {
        const specifier = ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
          ? node.moduleSpecifier
          : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
            ? node.arguments[0]
            : undefined
        if (specifier && ts.isStringLiteralLike(specifier) && specifier.text.startsWith('#slidev/')) {
          const name = specifier.text
          if (!Object.hasOwn(implementations, name))
            throw new Error(`${file}: no online implementation for ${name}`)
          imports.add(name)
        }
        ts.forEachChild(node, visit)
      }
      visit(ast)
    }
  }
  for (const [name, implementation] of Object.entries(implementations)) {
    const file = resolve(runtimeRoot, 'src/virtual', implementation)
    if (!(await stat(file)).isFile())
      throw new Error(`${name}: missing online implementation ${file}`)
  }
  return [...imports].sort()
}
