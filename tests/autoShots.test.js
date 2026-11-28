import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildLiveOverlay } from '../src/lib/liveLines.js'
import { chooseShot, collectShots, planInputShot, queueSteps, shotSignature } from '../src/lib/autoShots.js'

const root = resolve(import.meta.dirname, '..')
const read = relative => readFileSync(resolve(root, relative), 'utf8')

const built = () => buildLiveOverlay({
  source: 'demo-simulated',
  cueX: 300,
  cueY: 660,
  balls: [{ id: '1', x: 300, y: 300 }, { id: '9', x: 420, y: 420 }],
  pockets: [{ id: 'TL', x: 0, y: 0 }, { id: 'TM', x: 300, y: 0 }]
}, { calibration: { x: 0, y: 0, width: 600, height: 900 } })

test('shot collection uses only mapped cue, ghost and pocket coordinates', () => {
  const shots = collectShots(built())
  assert.equal(shots.length, 2)
  assert.deepEqual(shots.map(shot => shot.id).sort(), ['1', '9'])
  for (const shot of shots) {
    assert.ok(shot.distance > 0)
    assert.ok(Number.isFinite(shot.ghost.x) && Number.isFinite(shot.pocket.y))
  }
  assert.deepEqual(collectShots(null), [])
})

test('shot selection honors golden target, stripes and 8-ball phase', () => {
  const base = built()
  assert.equal(chooseShot(base, { goldenTarget: 1 }).shot.id, '1')
  assert.equal(chooseShot(base, { prioritize9: true }).shot.id, '9')
  assert.equal(chooseShot(base, {}, { phase: 'STRIPE_TURN' }).shot.id, '9')
  assert.equal(chooseShot(base, {}, { phase: 'SOLID_TURN' }).shot.id, '1')
  assert.equal(chooseShot(base, {}, { phase: 'EIGHT_BALL' }).reason, 'NO_GROUP_TARGET')
  assert.equal(chooseShot({ ok: false, lines: [] }).reason, 'NO_MAPPED_SHOT')
  assert.notEqual(shotSignature(chooseShot(base, { goldenTarget: 1 }).shot, { power: 40 }),
    shotSignature(chooseShot(base, { goldenTarget: 9 }).shot, { power: 40 }))
})

test('input planning produces a swipe and rejects missing coordinates', () => {
  const shot = chooseShot(built(), { goldenTarget: 1 }).shot
  const planned = planInputShot(built(), shot, { power: 80, autoPlayMode: 'Pro Player' })
  assert.equal(planned.ok, true)
  assert.equal(planned.power, 80)
  assert.equal(planned.swipe.duration, 320)
  assert.ok(planned.swipe.x2 !== planned.swipe.x1 || planned.swipe.y2 !== planned.swipe.y1)
  assert.equal(planInputShot(built(), { cuePath: { points: [{ x: 0, y: 0 }] }, ghost: { x: 0, y: 0 } }).reason, 'ZERO_LENGTH_SWIPE')
  assert.equal(planInputShot(built(), {}).reason, 'NO_SCREEN_COORDS')
})

test('queue taps are explicit and never defaulted to guessed buttons', () => {
  assert.deepEqual(queueSteps({ autoQueue: false }, { queue: { x: 10, y: 10 } }), [])
  assert.deepEqual(queueSteps({ autoQueue: true }, {}), [])
  const steps = queueSteps({ autoQueue: true, queueTable: 'London', queueDelay: 2 }, {
    queue: { x: 100, y: 200 },
    tables: { London: { x: 300, y: 400 } }
  })
  assert.equal(steps.length, 2)
  assert.deepEqual(steps[0], { action: 'tap', x: 100, y: 200, wait: 2000 })
  assert.deepEqual(steps[1], { action: 'tap', x: 300, y: 400, wait: 600 })
})

test('step 6 input RPC, bindings and session controls are wired', () => {
  const injector = read('android/app/src/main/java/com/d0j/engine/vm/VMInputInjector.java')
  const activity = read('android/app/src/main/java/com/d0j/engine/vm/VMActivityInputInjector.java')
  const provider = read('android/app/src/main/java/com/d0j/engine/vm/VMInputProvider.java')
  const remote = read('android/app/src/main/java/com/d0j/engine/vm/VMRemoteInputInjector.java')
  const proxy = read('android/app/src/main/java/com/d0j/engine/vm/VMProxyActivity.java')
  const hook = read('android/app/src/main/java/com/d0j/engine/vm/HookInstrumentation.java')
  const callProvider = read('android/app/src/main/java/com/d0j/engine/vm/SystemCallProvider.java')
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  const plugin = read('android/app/src/main/java/com/d0j/engine/D0JNativePlugin.java')
  const nativeJs = read('src/lib/native.js')
  const settings = read('src/screens/Settings.jsx')
  const menu = read('src/components/ModMenu.jsx')
  const overlay = read('android/app/src/main/java/com/d0j/engine/D0JOverlayService.java')
  const app = read('src/App.jsx')

  assert.ok(injector.includes('swipe('))
  assert.ok(activity.includes('dispatchTouchEvent'))
  assert.ok(!activity.includes('Accessibility'))
  assert.ok(provider.includes('"INPUT"'))
  assert.ok(remote.includes('.vminput.p'))
  assert.ok(proxy.includes('VMActivityInputInjector.bind(this)'))
  assert.ok(hook.includes('VMActivityInputInjector.bind(hosted)'))
  assert.ok(callProvider.includes('inputSwipe'))
  assert.ok(callProvider.includes('attachInput'))
  assert.equal((manifest.match(/\.vminput\.p[0-3]/g) || []).length, 4)
  for (const method of ['vmAttachInput', 'vmInputStatus', 'vmInputTap', 'vmInputSwipe']) {
    assert.ok(plugin.includes(`public void ${method}`))
    assert.ok(nativeJs.includes(`${method}:`))
  }
  assert.ok(settings.includes('Live Input + Auto Play'))
  assert.ok(menu.includes('START LIVE AUTO'))
  assert.ok(overlay.includes('Attach Live Input'))
  assert.ok(app.includes("command === 'autoLiveStart'"))
  assert.ok(app.includes('planHumanShot(built, chosen.shot, liveConfig, motion)'))
})
