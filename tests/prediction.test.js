import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applyPrediction, computePrediction, createDefaultTable, normalizeSpin, planShotLines } from '../src/lib/prediction.js'
import { createBridge } from '../src/lib/bridge.js'
import { runScriptSource } from '../src/lib/scriptRunner.js'

const scriptSource = () => readFileSync(resolve(import.meta.dirname, '../public/scripts/prediction-lines.js'), 'utf8')

test('computePrediction finds target, ghost ball and pocket', () => {
  const table = createDefaultTable()
  const prediction = computePrediction(table, { x: 300, y: 300 }, { power: 74, spin: 0 })

  assert.equal(prediction.target?.id, '1')
  assert.ok(prediction.ghost)
  assert.ok(prediction.pocket?.id)
  assert.equal(prediction.cuePath.length, 21)
  assert.ok(prediction.targetPath.length > 1)
})

test('spin bends the guide path and normalizes menu units', () => {
  const table = createDefaultTable()
  const straight = computePrediction(table, { x: 300, y: 300 }, { power: 74, spin: 0 })
  const curved = computePrediction(table, { x: 300, y: 300 }, { power: 74, spin: 0.8 })
  const mid = path => path[Math.floor(path.length / 2)]

  assert.ok(Math.abs(mid(straight.cuePath).x - mid(curved.cuePath).x) > 4)
  assert.equal(normalizeSpin(100), 1)
  assert.equal(normalizeSpin(-100), -1)
  assert.equal(normalizeSpin(0.5), 0.5)
})

test('computePrediction honors an explicit target and pocket', () => {
  const table = createDefaultTable()
  const plan = planShotLines(table, { power: 74, spin: 0 })
  const shot = plan.plans.find(p => p.ballId === '9')

  const prediction = computePrediction(table, shot.aim, {
    targetId: '9',
    pocketId: shot.pocket.id,
    power: 74,
    spin: 0
  })

  assert.equal(prediction.target?.id, '9')
  assert.equal(prediction.pocket?.id, shot.pocket.id)
  assert.deepEqual(prediction.origin, table.cue)
  assert.equal(prediction.cuePath.length, 21)
  assert.equal(prediction.targetPath.length, 21)
})

test('planShotLines returns one ghost/pocket plan per ball with the cue as source', () => {
  const table = createDefaultTable()
  const plan = planShotLines(table, { power: 74, spin: 0 })

  assert.equal(plan.ok, true)
  assert.deepEqual(plan.cue, table.cue)
  assert.equal(plan.plans.length, table.balls.length)
  for (const shot of plan.plans) {
    assert.ok(table.balls.some(b => b.id === shot.ballId))
    assert.ok(shot.ghost, `missing ghost for ${shot.ballId}`)
    assert.ok(shot.pocket?.id, `missing pocket for ${shot.ballId}`)
    assert.ok(shot.cutDeg >= 0 && shot.cutDeg <= 90)
  }
})

test('applyPrediction moves cue and can pot the target ball', () => {
  const table = createDefaultTable()
  const prediction = computePrediction(table, { x: 300, y: 300 }, { power: 100, spin: 0 })
  const next = applyPrediction(table, prediction, { power: 100 })

  assert.notDeepEqual(next.cue, table.cue)
  assert.equal(next.balls.some(b => b.id === '1'), false)
})

test('bridge exposes table, all-line planner and line state', async () => {
  const bridge = createBridge()
  bridge.reset()

  const table = await bridge.api.getTable()
  assert.equal(table.balls.length, 3)

  const plan = await bridge.api.planShots({ power: 74, spin: 0 })
  assert.equal(plan.plans.length, table.balls.length)

  const stored = await bridge.api.setLines([{
    ballId: '1',
    cuePath: [{ x: 300, y: 660 }, { x: 300, y: 400 }],
    targetPath: [{ x: 300, y: 300 }, { x: 300, y: 100 }]
  }])
  assert.equal(stored.count, 1)
  const state = await bridge.getState()
  assert.equal(state.lines.length, 1)
  assert.equal(state.lines[0].ballId, '1')

  await bridge.api.clearLines()
  assert.equal((await bridge.getState()).lines.length, 0)
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
  assert.equal(buildCopy, scriptSource())
})

test('prediction-lines script draws all ball lines on the local bridge', async () => {
  const logs = []
  const bridge = createBridge({ onLog: msg => logs.push(String(msg)) })
  bridge.reset()

  const report = await runScriptSource(scriptSource(), bridge.api, msg => logs.push(String(msg)))
  const text = logs.join('\n')
  const state = await bridge.getState()

  assert.equal(report.ok, true)
  assert.equal(report.predictions, 3)
  assert.equal(report.lines, 3)
  assert.equal(report.balls, 3)
  assert.equal(report.shots, 0)
  assert.equal(state.lines.length, 3)
  assert.match(text, /D0J LINE TEST: start power=/)
  assert.match(text, /LINE 1\/3: ball=/)
  assert.match(text, /pocket=TM cuePoints=21 targetPoints=21/)
  assert.match(text, /D0J LINE TEST: PASS \(3\/3 lines, 0 shots, simulated\)/)
})

test('prediction-lines script can still take three shots when configured', async () => {
  const logs = []
  const bridge = createBridge({ onLog: msg => logs.push(String(msg)) })
  bridge.reset()
  await bridge.setConfig({ lineTestShoot: true })

  const report = await runScriptSource(scriptSource(), bridge.api, msg => logs.push(String(msg)))
  const state = await bridge.getState()

  assert.equal(report.ok, true)
  assert.equal(report.shots, 3)
  assert.match(state.result, /^pot:/)
  assert.match(logs.join('\n'), /predict 1 -> TM/)
  assert.match(logs.join('\n'), /D0J LINE TEST: PASS \(3\/3 lines, 3 shots, simulated\)/)
})
