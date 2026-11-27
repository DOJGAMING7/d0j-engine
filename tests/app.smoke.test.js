import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runScriptSource } from '../src/lib/scriptRunner.js'

const sourcePath = resolve(import.meta.dirname, '../public/scripts/autoplay-ratimoda.js')
const source = readFileSync(sourcePath, 'utf8')

function makeBridge({ mode = 'Fast', manual = false, failFirstWait = false } = {}) {
  const logs = []
  const taps = []
  const configs = []

  let waitCalls = 0
  const state = {
    phase: manual ? 'MANUAL' : 'YOUR_TURN',
    turn: manual ? 'opponent' : 'you',
    result: null,
    aimError: 0,
    power: 74,
    manualInput: manual,
    queue: { queued: 0, matched: 0, completed: 0, failed: 0 }
  }

  const clone = () => JSON.parse(JSON.stringify(state))

  const api = {
    async getConfig() {
      return { mode, power: 74, stopOnManual: true }
    },
    async setConfig(patch) {
      configs.push({ ...patch })
      return { ...patch }
    },
    async getState() {
      return clone()
    },
    async waitFor(predicate) {
      waitCalls++
      if (failFirstWait && waitCalls === 1) throw new Error('timeout')

      for (let i = 0; i < 20; i++) {
        const snap = clone()
        if (predicate(snap)) return snap

        if (snap.phase === 'OPPONENT_TURN') {
          state.phase = 'RESULT'
          state.result = `sim:pot:${state.queue.queued + 1}`
          state.queue.queued += 1
          state.queue.completed += 1
          state.queue.matched += 1
        } else if (snap.phase === 'RESULT') {
          state.phase = 'YOUR_TURN'
          state.turn = 'you'
          state.result = null
        } else if (snap.phase === 'COOLDOWN') {
          state.phase = 'YOUR_TURN'
          state.turn = 'you'
          state.result = null
        }

        await Promise.resolve()
      }

      throw new Error('timeout')
    },
    async tap(x, y, delay) {
      taps.push({ x, y, delay })
      state.phase = 'OPPONENT_TURN'
      state.turn = 'opponent'
      state.result = `tap:${Math.round(x)},${Math.round(y)}`
      return { x, y, delay }
    },
    async sleep() {},
    stopAll() {}
  }

  return { api, logs, taps, configs }
}

test('Ratimoda v2 takes 3 shots, waits for turns, and requeues', async () => {
  const b = makeBridge({ mode: 'Fast' })
  const report = await runScriptSource(source, b.api, msg => b.logs.push(msg))
  const text = b.logs.join('\n')

  assert.equal(report.ok, true)
  assert.equal(report.shots, 3)
  assert.equal(report.requeued, true)
  assert.equal(b.taps.length, 3)

  assert.equal(b.configs[0].autoPlay, true)
  assert.equal(b.configs[0].autoQueue, true)
  assert.equal(b.configs[0].queueMode, 'SESSION')
  assert.equal(b.configs.at(-1).autoPlay, false)
  assert.equal(b.configs.at(-1).autoQueue, false)

  assert.match(text, /RATIMODA v2: start mode=Fast shots=3 queue=ON/)
  assert.match(text, /SHOT 1: aim=/)
  assert.match(text, /RESULT 1: sim:pot:1/)
  assert.match(text, /QUEUE: mode=SESSION queued=3/)
  assert.match(text, /RATIMODA v2: complete \(3\/3 shots, queued, simulated only\)/)

  for (const tap of b.taps) {
    assert.ok(tap.delay >= 90 && tap.delay <= 150, `Fast delay out of range: ${tap.delay}`)
    assert.ok(tap.x >= 80 && tap.x <= 1000)
    assert.ok(tap.y >= 200 && tap.y <= 1800)
  }
})

test('Ratimoda v2 stops safely on manual input', async () => {
  const b = makeBridge({ manual: true })
  const report = await runScriptSource(source, b.api, msg => b.logs.push(msg))

  assert.equal(report.ok, false)
  assert.equal(report.shots, 0)
  assert.equal(b.taps.length, 0)
  assert.match(b.logs.join('\n'), /STOP: manual input detected/)
  assert.match(b.logs.join('\n'), /RATIMODA v2: complete \(0\/3 shots, queued, simulated only\)/)
})

test('Ratimoda v2 retries one wait timeout and still completes', async () => {
  const b = makeBridge({ mode: 'Fast', failFirstWait: true })
  const report = await runScriptSource(source, b.api, msg => b.logs.push(msg))
  const text = b.logs.join('\n')

  assert.equal(report.ok, true)
  assert.equal(b.taps.length, 3)
  assert.match(text, /WAIT shot 1: opponent turn: timeout try=1\/3/)
  assert.match(text, /WAIT shot 1: opponent turn: ok try=2/)
})

test('script runner shadows browser globals', async () => {
  const result = await runScriptSource(
    'export default async function () { return typeof window + ":" + typeof fetch }',
    {},
    () => {}
  )
  assert.equal(result, 'undefined:undefined')
})

test('script source and public copy stay identical', () => {
  const buildCopy = readFileSync(resolve(import.meta.dirname, '../scripts/autoplay-ratimoda.js'), 'utf8')
  assert.equal(buildCopy, source)
})
