import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

// Carrega apenas as funções puras do módulo sem inicializar dispositivos do navegador.
const source = readFileSync(resolve('lib/voice/audio-dsp.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText
const audio = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))

test('captura mono e 48kHz; processamento neural sem supressão nativa duplicada', () => {
  const mode = audio.captureForProfile({noiseMode:'rnnoise',echo:true,gain:false,inputGainDb:0})
  assert.equal(mode.channelCount, 1)
  assert.equal(mode.sampleRate, 48000)
  assert.equal(mode.echoCancellation, true)
  assert.equal(mode.noiseSuppression, false)
})

test('fallback nativo preserva cancelamento de eco independente', () => {
  const mode = audio.captureForProfile({noiseMode:'native',echo:false,gain:true,inputGainDb:0},'test-device')
  assert.equal(mode.noiseSuppression, true)
  assert.equal(mode.echoCancellation, false)
  assert.equal(mode.deviceId, 'test-device')
  assert.equal(mode.autoGainControl, true)
})

test('ganho limitado para evitar amplificação excessiva', () => {
  assert.equal(audio.safeInputGain(100), 6)
  assert.equal(audio.safeInputGain(-100), -12)
  assert.equal(audio.safeInputGain(NaN), 0)
  assert.ok(Math.abs(audio.dbToGain(0) - 1) < 0.0001)
  assert.ok(audio.dbToGain(6) < 2.01)
})

test('modos neurais são distinguidos de natural/nativo', () => {
  assert.equal(audio.isAdvancedNoise('rnnoise'), true)
  assert.equal(audio.isAdvancedNoise('gtcrn'), true)
  assert.equal(audio.isAdvancedNoise('native'), false)
  assert.equal(audio.isAdvancedNoise('off'), false)
})
