import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runScriptSource } from '../src/lib/scriptRunner.js'

test('Ratimoda autoplay test script runs on the simulated bridge API', async () => {
  const logs = []
  const taps = []
  const applied = []
  const api = {
    async setConfig(patch) { applied.push(patch); return patch },
    async getState() { return { turn: 'you', power: 74, aimError: 0, spin: 0 } },
    async waitFor() { return { turn: 'you' } },
    async tap(x, y, delay) { taps.push({ x, y, delay }) },
    async sleep() {}
  }

  const source = readFileSync(resolve(import.meta.dirname, '../public/scripts/autoplay-ratimoda.js'), 'utf8')
  await runScriptSource(source, api, msg => logs.push(msg))

  assert.equal(taps.length, 3)
  assert.equal(applied[0].autoPlay, true)
  assert.equal(applied[0].autoQueue, true)
  assert.match(logs.join('\n'), /RATIMODA TEST: complete \(3 shots, simulated only\)/)
})

test('script runner shadows browser globals', async () => {
  const result = await runScriptSource('export default async function () { return typeof window + ":" + typeof fetch }', {}, () => {})
  assert.equal(result, 'undefined:undefined')
})
