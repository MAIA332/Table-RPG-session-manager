#!/usr/bin/env node
/** Publica os assets locais da versão instalada de @sapphi-red/web-noise-suppressor.
 * Node resolve usa "exports" do pacote, sem depender de estrutura privada do npm.
 * Nunca publica arquivos placeholder: manifest só aparece se TODOS os assets forem válidos.
 */
import { createRequire } from 'node:module'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const require = createRequire(import.meta.url)
const out = resolve('public/voice-dsp')
const strict = process.argv.includes('--strict')
const files = [
  ['rnnoiseWorklet.js', 'rnnoise-worklet.js', 'javascript'],
  ['rnnoise.wasm', 'rnnoise.wasm', 'wasm'],
  ['rnnoise_simd.wasm', 'rnnoise_simd.wasm', 'wasm'],
  ['gtcrnWorklet.js', 'gtcrn-worklet.js', 'javascript'],
  ['gtcrn.wasm', 'gtcrn.wasm', 'wasm'],
]
const sourceFiles = []
try {
  for (const [sourceName, targetName, type] of files) {
    const source = require.resolve(`@sapphi-red/web-noise-suppressor/${sourceName}`)
    const data = readFileSync(source)
    if (data.length < 1024) throw new Error(`${sourceName} tem conteúdo inesperadamente pequeno`)
    if (type === 'wasm' && data.subarray(0, 4).toString('hex') !== '0061736d') {
      throw new Error(`${sourceName} não é um WASM válido`)
    }
    sourceFiles.push({ source, targetName, size: data.length, sha256: createHash('sha256').update(data).digest('hex') })
  }
  mkdirSync(out, { recursive: true })
  for (const file of sourceFiles) copyFileSync(file.source, join(out, file.targetName))
  writeFileSync(join(out, 'assets.json'), JSON.stringify({
    version: 1, models: ['rnnoise', 'gtcrn'],
    files: sourceFiles.map(({targetName,size,sha256}) => ({name:targetName,size,sha256})),
  }, null, 2) + '\n')
  console.log(`[voice-dsp] ${sourceFiles.length} arquivos WASM/Worklet publicados em public/voice-dsp/`)
} catch (error) {
  // Evita anunciar assets incorretos herdados de um build anterior.
  mkdirSync(out, { recursive: true })
  rmSync(join(out, 'assets.json'), { force: true })
  console.error('[voice-dsp] Arquivos neurais indisponíveis:', error.message)
  console.error('[voice-dsp] Execute npm install (ou pnpm install) antes do build. A chamada usa modo nativo como alternativa.')
  if (strict) process.exitCode = 1
}
