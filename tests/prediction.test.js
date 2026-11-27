import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applyPrediction, computePrediction, createDefaultTable } from '../src/lib/prediction.js'
import { createBridge } from '../src/lib/bridge.js'
import { runScriptSource } from '../src/lib/scriptRunner.js'

test('computePrediction finds target, ghost ball and pocket', () => {
  const table = createDefaultTable()
  const prediction = computePrediction(table, { x: 300, y: 300 }, { power: 74, spin: 0 })

  assert.equal(prediction.target?.id, '1')
  assert.ok(prediction.ghost)
  assert.ok(prediction.pocket?.id)
  assert.equal(prediction.cuePath.length, 21)
  assert.ok(prediction.targetPath.length > 1)
})

test('spin bends the guide path', () => {
  const table = createDefaultTable()
  const straight = computePrediction(table, { x: 300, y: 300 }, { power: 74, spin: 0 })
  const curved = computePrediction(table, { x: 300, y: 300 }, { power: 74, spin: 0.8 })
  const mid = path => path[Math.floor(path.length / 2)]

  assert.ok(Math.abs(mid(straight.cuePath).x - mid(curved.cuePath).x) > 4)
})

test('applyPrediction moves cue and can pot the target ball', () => {
  const table = createDefaultTable()
  const prediction = computePrediction(table, { x: 300, y: 300 }, { power: 100, spin: 0 })
  const next = applyPrediction(table, prediction, { power: 100 })

  assert.notDeepEqual(next.cue, table.cue)
  assert.equal(next.balls.some(b => b.id === '1'), false)
})

test('bridge exposes predict and shoot with table state', async () => {
  const bridge = createBridge()
  bridge.reset()

  const prediction = await bridge.api.predict({ aim: { x: 300, y: 300 }, power: 74 })
  assert.equal(prediction.target?.id, '1')

  const after = await bridge.api.shoot({ aim: { x: 300, y: 300 }, power: 74 })
  const state = await bridge.getState()

  assert.equal(after.target?.id, '1')
  assert.equal(state.turn, 'opponent')
  assert.match(state.result, /^pot:1:/)
})

test('prediction script source and public copy stay identical', () => {
  const buildCopy = readFileSync(resolve(import.meta.dirname, '../scripts/prediction-lines.js'), 'utf8')
  const publicCopy = readFileSync(resolve(import.meta.dirname, '../public/scripts/prediction-lines.js'), 'utf8')
  assert.equal(buildCopy, publicCopy)
})

test('prediction-lines script runs 3 shots on the local bridge', async () => {
  const logs = []
  const bridge = createBridge({ onLog: msg => logs.push(String(msg)) })
  bridge.reset()

  const source = readFileSync(resolve(import.meta.dirname, '../public/scripts/prediction-lines.js'), 'utf8')
  const report = await runScriptSource(source, bridge.api, msg => logs.push(String(msg)))
  const text = logs.join('\n')

  assert.equal(report.ok, true)
  assert.equal(report.predictions, 3)
  assert.match(text, /D0J LINE TEST: start power=/)
  assert.match(text, /LINE 1: aim=300,300 target=1 pocket=/)
  assert.match(text, /D0J LINE TEST: complete \(3\/3 predictions, simulated only\)/)
})
