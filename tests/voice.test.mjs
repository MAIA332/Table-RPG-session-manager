import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const here = dirname(fileURLToPath(import.meta.url))
const moduleJs = ts.transpileModule(fs.readFileSync(resolve(here, '../lib/voice/attachments.ts'), 'utf8'), {
  fileName: 'attachments.ts', compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const shim = { exports: {} }
const mockRequire = (name) => {
  if (name === 'server-only') return {}
  if (name === './types') return { VOICE_FILE_MAX_BYTES: 2 * 1024 * 1024 }
  return require(name)
}
new Function('module','exports','require', moduleJs)(shim, shim.exports, mockRequire)
const { encodeAttachment, decodeAttachment } = shim.exports

const make = (bytes, mime = 'application/octet-stream', name = 'arquivo.bin') =>
  ({ name, mime, dataBase64: bytes.toString('base64') })

test('gzip+base64 preserva bytes e metadados separados', () => {
  const bytes = Buffer.from('uma mensagem RPG com acentos mágicos 🧙'.repeat(50))
  const doc = encodeAttachment(make(bytes))
  assert.equal(doc.encoding, 'gzip+base64')
  assert.equal(doc.originalSize, bytes.length)
  assert.equal(Buffer.compare(decodeAttachment(doc.compressedDataBase64), bytes), 0)
  assert.ok(doc.compressedSize < bytes.length)
})

test('imagem não pode ser forjada pelo MIME', () => {
  const fake = encodeAttachment(make(Buffer.from('<svg/onload=alert(1)>'), 'image/png', 't.svg'))
  assert.equal(fake.kind, 'file')
  assert.equal(fake.mime, 'application/octet-stream')
  const jpeg = encodeAttachment(make(Buffer.from([0xff,0xd8,0xff,0xd9]), 'image/jpeg', 'x.jpg'))
  assert.equal(jpeg.kind, 'image')
})

test('limite 2 MiB aplicado antes do gzip, inclusive incompressíveis', () => {
  const big = Buffer.alloc(2*1024*1024)
  const doc = encodeAttachment(make(big))
  assert.equal(decodeAttachment(doc.compressedDataBase64).length, big.length)
  assert.throws(() => encodeAttachment(make(Buffer.alloc(2*1024*1024+1))), /2 MiB|Base64/)
})

test('base64 estrito, nomes normalizados e gzip malformado rejeitado', () => {
  assert.throws(() => encodeAttachment({name:'foo',mime:'text/plain',dataBase64:'*bad*'}))
  const doc = encodeAttachment(make(Buffer.from('ok'), 'text/plain', '../../foo\\bar.txt'))
  assert.doesNotMatch(doc.name, /[\\/]/)
  assert.throws(() => decodeAttachment(Buffer.from('not-gzip').toString('base64')))
})

test('mapeamento de microfone/painel reutiliza os botões LT + L3/R3', () => {
  const source = fs.readFileSync(resolve(here, '../lib/input/actions.ts'), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  const dummyRequire = (name) => {
    if (name === './targeted-actions') return {isTargetAction: () => false}
    if (name === './soundpad-commands') return {sanitizeSoundpadBindings: () => ({})}
    return require(name)
  }
  new Function('module','exports','require',js)({exports}, exports, dummyRequire)
  assert.equal(exports.actionForButton('LS', new Set(['LT','LS'])), 'voice.panel.toggle')
  assert.equal(exports.actionForButton('RS', new Set(['LT','RS'])), 'voice.mute.toggle')
  const bindings = {...exports.DEFAULT_BINDINGS, RS: 'voice.ptt'}
  assert.equal(exports.actionForButton('RS', new Set(['RS']), bindings), 'voice.ptt')
  assert.equal(exports.collectActions(new Set(['RS']), new Set(), 1, new Map(), 200, bindings)[0], 'voice.ptt')
})

test('dispatcher hold publica press/release sem duplicar o handler', () => {
  const source = fs.readFileSync(resolve(here, '../lib/input/hold.ts'), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  new Function('module', 'exports', 'require', js)({exports}, exports, require)
  const received = []
  const dispose = exports.registerInputHoldHandler((action, held) => received.push([action, held]))
  exports.dispatchInputHoldAction('voice.ptt', true)
  exports.dispatchInputHoldAction('voice.ptt', false)
  dispose()
  exports.dispatchInputHoldAction('voice.ptt', true)
  assert.deepEqual(received, [['voice.ptt', true], ['voice.ptt', false]])
})
