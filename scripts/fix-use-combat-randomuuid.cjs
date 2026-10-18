#!/usr/bin/env node
/**
 * Correção cirúrgica de crypto.randomUUID() no hook useCombat.
 * Executar na raiz do repositório Next.js: node scripts/fix-use-combat-randomuuid.cjs
 * Faz backup antes de escrever, aborta se não encontrar o padrão.
 */
const fs = require('node:fs')
const path = require('node:path')

function rewrite(source) {
  const signature = /\b(?:(?:globalThis|window)\.)?crypto\.randomUUID\s*\(\s*\)/g
  const count = [...source.matchAll(signature)].length
  if (!count) return { count: 0, source }
  const importStmt = 'import { createClientId } from "@/lib/client-id"'
  if (/\b(?:function|const|let|class)\s+createClientId\b/.test(source)) {
    throw new Error('Nome createClientId já declarado em use-combat.ts. Correção manual necessária.')
  }
  let next = source.replace(signature, 'createClientId()')
  if (!/import\s*\{[^}]*\bcreateClientId\b[^}]*\}\s*from\s*["']@\/lib\/client-id["']/.test(next)) {
    const pragma = /^(\uFEFF?\s*["']use client["'];?\s*\r?\n)/
    if (pragma.test(next)) next = next.replace(pragma, `$1${importStmt}\n`)
    else next = `${importStmt}\n${next}`
  }
  return { count, source: next }
}

if (require.main === module) {
  const root = process.cwd()
  const target = path.join(root, 'lib', 'use-combat.ts')
  const helper = path.join(root, 'lib', 'client-id.ts')
  if (!fs.existsSync(target)) {
    console.error('ERRO: lib/use-combat.ts não encontrado. Execute na raiz do projeto Next.js.')
    process.exit(1)
  }
  if (!fs.existsSync(helper) || !fs.readFileSync(helper, 'utf8').includes('createClientId')) {
    console.error('ERRO: lib/client-id.ts com createClientId não encontrado. Copie o arquivo do pacote para lib/.')
    process.exit(1)
  }
  const original = fs.readFileSync(target, 'utf8')
  let result
  try { result = rewrite(original) }
  catch (err) { console.error(err.message); process.exit(1) }
  if (!result.count) {
    console.log('Nenhuma chamada crypto.randomUUID() encontrada em lib/use-combat.ts; arquivo não modificado.')
    console.log('Procure outros pontos: rg -n "randomUUID" lib components')
    process.exitCode = 2
  } else {
    const backup = `${target}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`
    const tmp = `${target}.tmp-${process.pid}`
    fs.copyFileSync(target, backup)
    try {
      fs.writeFileSync(tmp, result.source, 'utf8')
      fs.renameSync(tmp, target)
    } catch (error) {
      try { fs.unlinkSync(tmp) } catch {}
      throw error
    }
    console.log(`OK: ${result.count} chamada(s) substituída(s) em lib/use-combat.ts`)
    console.log(`Backup: ${path.relative(root, backup)}`)
    console.log('Valide com: npx tsc --noEmit && npm run build')
  }
}
module.exports = { rewrite }
