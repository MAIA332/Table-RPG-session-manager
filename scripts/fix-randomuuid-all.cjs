#!/usr/bin/env node
/**
 * Substitui chamadas globais de crypto.randomUUID() por createClientId()
 * recursivamente em lib/, components/ e componentes/.
 *
 * Executar na raiz do Next.js:
 *   node scripts/fix-randomuuid-all.cjs --dry-run
 *   node scripts/fix-randomuuid-all.cjs
 *
 * Usa o parser TypeScript do projeto para ignorar comentários/strings.
 * Mantém backups e não modifica chamadas de crypto definido/importado localmente.
 */
const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const dryRun = process.argv.includes('--dry-run')
const importStatement = 'import { createClientId } from "@/lib/client-id"'
const scanDirs = ['lib', 'components', 'componentes']
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx'])
const ignoredDirectories = new Set([
  'node_modules', '.git', '.next', '.turbo', 'dist', 'build',
  'coverage', '.vercel', '.cache',
])

function abort(message) {
  console.error(`ERRO: ${message}`)
  process.exit(1)
}

if (process.argv.some((a) => a.startsWith('--') && a !== '--dry-run')) {
  abort('Opção inválida. Use --dry-run ou execute sem argumentos para aplicar.')
}

// O projeto Next.js com TypeScript já deve ter essa dependência instalada.
let ts
try {
  ts = require(require.resolve('typescript', { paths: [root] }))
} catch {
  abort('TypeScript não encontrado. Instale as dependências do projeto (npm ci).')
}

const helper = path.join(root, 'lib', 'client-id.ts')
if (!fs.existsSync(helper) ||
    !/\b(?:export\s+)?(?:function|const)\s+createClientId\b/.test(fs.readFileSync(helper, 'utf8'))) {
  abort('lib/client-id.ts deve exportar a função createClientId antes desta correção.')
}

function listFiles(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) listFiles(file, result)
    } else if (entry.isFile() && extensions.has(path.extname(entry.name))) {
      result.push(file)
    }
  }
  return result
}

function hasBoundName(ast, name) {
  let found = false
  const isName = (node) => ts.isIdentifier(node) && node.text === name
  function visit(node) {
    if (found) return
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node) ||
         ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) ||
         ts.isImportClause(node) || ts.isImportSpecifier(node) ||
         ts.isNamespaceImport(node) || ts.isBindingElement(node) ||
         ts.isCatchClause(node)) && node.name && isName(node.name)) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return found
}

function existingClientIdImport(ast) {
  for (const stmt of ast.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue
    if (!/(?:^@\/lib\/client-id$|\/client-id$)/.test(stmt.moduleSpecifier.text)) continue
    const bindings = stmt.importClause?.namedBindings
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) {
        if ((el.propertyName?.text || el.name.text) === 'createClientId' &&
            !stmt.importClause?.isTypeOnly && !el.isTypeOnly) return el.name.text
      }
    }
  }
  return null
}

function isGlobalCryptoExpression(expression) {
  // crypto.randomUUID() (somente se crypto não foi declarado no arquivo)
  if (ts.isIdentifier(expression)) return expression.text === 'crypto' ? 'bare' : null
  // window.crypto.randomUUID() / globalThis.crypto.randomUUID() / self.crypto.randomUUID()
  if (ts.isPropertyAccessExpression(expression) && expression.name.text === 'crypto' &&
      ts.isIdentifier(expression.expression) &&
      ['window', 'globalThis', 'self'].includes(expression.expression.text)) {
    return 'explicit'
  }
  return null
}

function importInsertion(source, ast) {
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const imports = ast.statements.filter(ts.isImportDeclaration)
  if (imports.length) {
    return { pos: imports[imports.length - 1].end, text: `${eol}${importStatement}` }
  }
  let lastDirective
  for (const stmt of ast.statements) {
    if (ts.isExpressionStatement(stmt) && ts.isStringLiteral(stmt.expression)) {
      lastDirective = stmt
    } else break
  }
  if (lastDirective) return { pos: lastDirective.end, text: `${eol}${importStatement}` }

  const bom = source.charCodeAt(0) === 0xFEFF ? 1 : 0
  const shebang = source.slice(bom).startsWith('#!')
  const afterShebang = shebang ? source.indexOf('\n', bom) + 1 : bom
  const position = afterShebang > bom ? afterShebang : bom
  return { pos: position, text: `${importStatement}${eol}` }
}

function rewrite(source, filename) {
  if (!source.includes('randomUUID')) return { count: 0, skipped: 0, source }
  const kind = filename.endsWith('.tsx') || filename.endsWith('.jsx')
    ? ts.ScriptKind.TSX
    : filename.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, kind)
  if (ast.parseDiagnostics.length) {
    const details = ast.parseDiagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('; ')
    throw new Error(`${path.relative(root, filename)}: erro de sintaxe antes da alteração: ${details}`)
  }

  const cryptoIsBound = hasBoundName(ast, 'crypto')
  const globalIsBound = ['window', 'globalThis', 'self'].some((key) => hasBoundName(ast, key))
  const edits = []
  let skipped = 0
  function visit(node) {
    if (ts.isCallExpression(node) && node.arguments.length === 0 &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'randomUUID') {
      const target = isGlobalCryptoExpression(node.expression.expression)
      if (target === 'bare' && cryptoIsBound || target === 'explicit' && globalIsBound) {
        skipped++ // Não alterar um objeto crypto sombreado/importado.
      } else if (target) {
        edits.push({ pos: node.getStart(ast), end: node.end })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  if (!edits.length) return { count: 0, skipped, source }

  const alreadyImported = existingClientIdImport(ast)
  if (!alreadyImported && hasBoundName(ast, 'createClientId')) {
    throw new Error(`${path.relative(root, filename)}: createClientId já declarado/importado de outra origem. Revisão manual necessária.`)
  }
  const callName = alreadyImported || 'createClientId'
  const changes = edits.map(({ pos, end }) => ({ pos, end, text: `${callName}()` }))
  if (!alreadyImported) {
    const insertion = importInsertion(source, ast)
    changes.push({ pos: insertion.pos, end: insertion.pos, text: insertion.text })
  }
  let next = source
  for (const { pos, end, text } of changes.sort((a, b) => b.pos - a.pos)) {
    next = next.slice(0, pos) + text + next.slice(end)
  }
  return { count: edits.length, skipped, source: next }
}

function main() {
  const dirs = scanDirs.map((name) => path.join(root, name)).filter(fs.existsSync)
  if (!dirs.length) abort('Nenhuma pasta lib/, components/ ou componentes/ encontrada.')
  const paths = dirs.flatMap((dir) => listFiles(dir))
    .filter((file) => path.resolve(file) !== path.resolve(helper)) // Evita recursão dentro de createClientId().
    .sort()
  const updates = []
  let skipped = 0
  try {
    for (const filename of paths) {
      const original = fs.readFileSync(filename, 'utf8')
      const result = rewrite(original, filename)
      skipped += result.skipped
      if (result.count) updates.push({ filename, original, ...result })
    }
  } catch (error) {
    abort(error instanceof Error ? error.message : String(error))
  }

  console.log(`Arquivos examinados: ${paths.length}`)
  for (const update of updates) {
    console.log(`${dryRun ? '[SIMULAÇÃO]' : '[ALTERAR]'} ${path.relative(root, update.filename)}: ${update.count} chamada(s)`)
  }
  if (skipped) console.warn(`Aviso: ${skipped} chamada(s) de crypto com nome local/importado foram preservadas.`)
  if (!updates.length) {
    console.log('Nenhuma chamada global a crypto.randomUUID() encontrada. Nada foi modificado.')
    return
  }
  if (dryRun) {
    console.log(`Simulação concluída: ${updates.reduce((sum, item) => sum + item.count, 0)} substituição(ões), nenhum arquivo escrito.`)
    return
  }

  const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`
  const written = []
  try {
    // Faz TODOS os backups antes de alterar qualquer arquivo.
    for (const entry of updates) {
      entry.backup = `${entry.filename}.bak-${stamp}`
      fs.copyFileSync(entry.filename, entry.backup, fs.constants.COPYFILE_EXCL)
    }
    for (const entry of updates) {
      const tmp = `${entry.filename}.tmp-${stamp}`
      try {
        fs.writeFileSync(tmp, entry.source, { encoding: 'utf8', flag: 'wx' })
        fs.renameSync(tmp, entry.filename)
        written.push(entry)
      } finally {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
      }
    }
  } catch (error) {
    for (const entry of written.reverse()) fs.copyFileSync(entry.backup, entry.filename)
    abort(`Gravação falhou; arquivos alterados foram restaurados: ${error.message}`)
  }
  console.log(`OK: ${updates.length} arquivo(s), ${updates.reduce((sum, item) => sum + item.count, 0)} chamada(s) substituída(s).`)
  console.log('Backups criados lado a lado com os originais (.bak-DATA).')
  console.log('Valide com: npx tsc --noEmit && npm run build')
}

if (require.main === module) main()
module.exports = { rewrite }
