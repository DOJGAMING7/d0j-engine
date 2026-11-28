import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHumanMotion } from '../src/lib/humanMotion.js'
import { planHumanShot } from '../src/lib/autoShots.js'

const root = resolve(import.meta.dirname, '..')
const read = relative => readFileSync(resolve(root, relative), 'utf8')

const input = (seed = 7, patch = {}) => {
  const motion = createHumanMotion(seed)
  return {
    motion,
    planned: motion.plan({
      from: { x: 100, y: 800 },
      to: { x: 520, y: 250 },
      config: { power: 74, mode: 'Human', autoPlayMode: 'Pro Player' },
      shot: { id: '1', distance: 700 },
      difficulty: 0.5,
      ...patch
    })
  }
}

const step = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length

test('human motion is seeded but varies between players', () => {
  const a = input(11).planned
  const b = input(11).planned
  const c = input(12).planned
  assert.deepEqual(a.points, b.points)
  assert.notDeepEqual(a.points, c.points)
  assert.ok(a.durationMs > 0 && a.durationMs < 6000)
})

test('aim speed is bell-shaped with hesitation and micro-adjustments', () => {
  const { planned } = input()
  assert.equal(planned.ok, true)
  const pts = planned.points
  const approach = planned.approachPoints
  const steps = []
  for (let i = 1; i < approach; i++) steps.push(step(pts[i - 1], pts[i]))
  const first = mean(steps.slice(0, 3))
  const middle = mean(steps.slice(Math.floor(steps.length / 2) - 1, Math.floor(steps.length / 2) + 2))
  const last = mean(steps.slice(-3))
  assert.ok(middle > first, `middle ${middle} should exceed start ${first}`)
  assert.ok(middle > last, `middle ${middle} should exceed finish ${last}`)
  assert.ok(planned.points.length - approach >= 4)
  assert.ok(planned.corrections >= 1)
  assert.ok(planned.finalError < 12)
  assert.ok(planned.overshootPx > 3)
  assert.ok(new Set(planned.points.slice(1).map(p => p.delay)).size > 6)
})

test('jitter is curved and correlated, not a straight teleport', () => {
  const { planned } = input(23)
  const from = { x: 100, y: 800 }
  const to = { x: 520, y: 250 }
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  const perp = p => ((p.x - from.x) * dy - (p.y - from.y) * dx) / length
  const offsets = planned.points.slice(1, planned.approachPoints - 1).map(perp)
  assert.ok(Math.max(...offsets.map(Math.abs)) > 0.5)
  let signChanges = 0
  for (let i = 1; i < offsets.length; i++) if (Math.sign(offsets[i]) !== Math.sign(offsets[i - 1])) signChanges++
  assert.ok(signChanges < offsets.length / 2)
  assert.ok(planned.points.some(p => p.pressure !== planned.points[0].pressure))
})

test('reaction time, duration and power vary; hard shots get more work', () => {
  const motion = createHumanMotion(31)
  const reactions = new Set(Array.from({ length: 20 }, () => motion.reactionDelay(0.7)))
  assert.ok(reactions.size > 10)
  assert.ok([...reactions].every(value => value >= 500 && value <= 3100))

  const easy = input(41, { difficulty: 0.1, shot: { id: '1', distance: 240 } }).planned
  const hard = input(41, { difficulty: 0.9, shot: { id: '8', distance: 950 } }).planned
  assert.ok(hard.durationMs > easy.durationMs)
  assert.ok(hard.corrections >= easy.corrections)
  assert.ok(hard.finalError < 12)

  const motion2 = createHumanMotion(51)
  const a = motion2.plan({ from: { x: 0, y: 0 }, to: { x: 200, y: 0 }, config: { power: 74 }, difficulty: 0.2 })
  const b = motion2.plan({ from: { x: 0, y: 0 }, to: { x: 200, y: 0 }, config: { power: 74 }, difficulty: 0.2 })
  assert.notEqual(a.power, b.power)
})

test('mistakes are occasional and can be disabled', () => {
  let slips = 0
  for (let i = 0; i < 120; i++) {
    const motion = createHumanMotion(900 + i)
    const planned = motion.plan({
      from: { x: 0, y: 500 }, to: { x: 300, y: 100 },
      config: { power: 74, mode: 'Pro Fast' }, difficulty: 0.4
    })
    if (planned.mistake) slips++
  }
  assert.ok(slips > 0 && slips < 20)
  const noSlips = input(5, { config: { power: 74, humanMistakes: false } }).planned
  assert.equal(noSlips.mistake, false)
})

test('autoplay uses mapped coordinates and the timed path bridge', () => {
  const built = {
    ok: true,
    lines: [
      { id: 'cue-1', type: 'path', points: [{ x: 100, y: 300 }, { x: 250, y: 180 }] },
      { id: 'ghost-1', type: 'circle', x: 250, y: 180 },
      { id: 'pocket-1', type: 'circle', x: 300, y: 0, id: 'P' }
    ]
  }
  const shot = {
    id: '1', distance: 180, cuePath: built.lines[0],
    ghost: built.lines[1], pocket: built.lines[2]
  }
  const planned = planHumanShot(built, shot, { power: 74, mode: 'Human' }, createHumanMotion(3))
  assert.equal(planned.ok, true)
  assert.equal(planned.profile, 'human')
  assert.ok(planned.path.points.length > 5)
  assert.ok(planned.swipe.x1 === 100 && planned.swipe.y1 === 300)

  const injector = read('android/app/src/main/java/com/d0j/engine/vm/VMActivityInputInjector.java')
  const provider = read('android/app/src/main/java/com/d0j/engine/vm/VMInputProvider.java')
  const remote = read('android/app/src/main/java/com/d0j/engine/vm/VMRemoteInputInjector.java')
  const calls = read('android/app/src/main/java/com/d0j/engine/vm/SystemCallProvider.java')
  const plugin = read('android/app/src/main/java/com/d0j/engine/D0JNativePlugin.java')
  const nativeJs = read('src/lib/native.js')
  const app = read('src/App.jsx')

  assert.ok(injector.includes('MotionEvent.obtain'))
  assert.ok(injector.includes('public boolean path(String json)'))
  assert.ok(provider.includes('"path"'))
  assert.ok(remote.includes('boolean path(String json)'))
  assert.ok(calls.includes('"inputPath"'))
  assert.ok(plugin.includes('public void vmInputPath'))
  assert.ok(nativeJs.includes('vmInputPath:'))
  assert.ok(app.includes('planHumanShot(built, chosen.shot, liveConfig, motion)'))
  assert.ok(app.includes('native.vmInputPath('))
  assert.ok(app.includes('createHumanMotion('))
})
