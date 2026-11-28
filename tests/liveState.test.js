import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bindingsStatus, mapSnapshotToTable, snapshotStatus } from '../src/lib/liveState.js'
import { planShotLines } from '../src/lib/prediction.js'

const root = resolve(import.meta.dirname, '..')
const read = relative => readFileSync(resolve(root, relative), 'utf8')
const vmDir = 'android/app/src/main/java/com/d0j/engine/vm/'

const demoSnapshot = () => ({
  source: 'demo-simulated',
  cueX: 300,
  cueY: 660,
  balls: [{ id: '1', x: 300, y: 300 }, { id: '9', x: 420, y: 420 }],
  pockets: [{ id: 'TL', x: 0, y: 0 }, { id: 'TM', x: 300, y: 0 }]
})

test('snapshot status rejects unmeasured state instead of inventing it', () => {
  assert.deepEqual(snapshotStatus(null), { ok: false, reason: 'NO_SNAPSHOT' })
  assert.equal(snapshotStatus({ balls: [{ x: 1, y: 1 }] }).reason, 'CUE_NOT_MEASURED')
  assert.equal(snapshotStatus({ cueX: 1, cueY: 2 }).reason, 'BALLS_NOT_MEASURED')
  assert.equal(snapshotStatus({ cueX: 1, cueY: 2, balls: [{ x: 1, y: 1 }] }).reason, 'POCKETS_NOT_MEASURED')
  assert.equal(snapshotStatus(demoSnapshot()).ok, true)
  assert.equal(snapshotStatus(demoSnapshot()).simulated, true)
})

test('mapped snapshots feed the real prediction planner', () => {
  const table = mapSnapshotToTable(demoSnapshot())
  assert.deepEqual(table.cue, { x: 300, y: 660 })
  assert.equal(table.balls.length, 2)
  assert.equal(table.pockets.length, 2)

  const plan = planShotLines(table, { power: 74, spin: 0 })
  assert.equal(plan.ok, true)
  assert.equal(plan.plans.length, 2)
  for (const shot of plan.plans) assert.ok(shot.ghost && shot.pocket?.id)
})

test('incomplete snapshots never produce a table', () => {
  assert.throws(() => mapSnapshotToTable({ cueX: 10, cueY: 20 }), /CUE_NOT_MEASURED|BALLS_NOT_MEASURED|POCKETS_NOT_MEASURED/)
  assert.throws(() => mapSnapshotToTable({ cueX: 10, cueY: 20, balls: [{ x: 1, y: 1 }] }), /POCKETS_NOT_MEASURED/)
})

test('unmeasured bindings are rejected and never defaulted to offsets', () => {
  const bundled = JSON.parse(read('android/app/src/main/assets/vm/bindings/8bp-56.34.0.json'))
  assert.equal(bundled.status, 'UNMEASURED')
  assert.equal(bundled.usable, false)
  for (const [key, value] of Object.entries(bundled)) {
    if (key.endsWith('Offset') || key === 'ballStride') assert.equal(value, null, `${key} must be null`)
  }
  assert.deepEqual(bindingsStatus(bundled), { usable: false, reason: 'BINDINGS_UNMEASURED' })
  assert.equal(bindingsStatus({ ...bundled, status: 'MEASURED' }).reason, 'CUEXOFFSET_MISSING')
})

test('step 4 state schema and probe ship with no fabricated addresses', () => {
  const snapshot = read(vmDir + 'VMStateSnapshot.java')
  const binding = read(vmDir + 'VMPointerBinding.java')
  const provider = read(vmDir + 'VMProbeStateProvider.java')
  const probe = read(vmDir + 'VMStateProbe.java')
  const demo = read(vmDir + 'VMDemoStateProvider.java')

  assert.ok(snapshot.includes('isComplete()'))
  assert.ok(binding.includes('STATUS_UNMEASURED'))
  assert.ok(binding.includes('unusableReason()'))
  assert.ok(binding.includes('raw instanceof Number'))
  assert.ok(provider.includes('binding.isUsable()'))
  assert.ok(provider.includes('MODULE_BASE_UNKNOWN'))
  assert.ok(probe.includes('NO_MEMORY_READER'))
  assert.ok(probe.includes('Caller supplies'))
  assert.ok(demo.includes('demo-simulated'))
})

test('per-process reader is real local IPC, not a fabricated offset table', () => {
  const proc = read(vmDir + 'VMProcMemoryReader.java')
  const remote = read(vmDir + 'VMRemoteMemoryReader.java')
  const provider = read(vmDir + 'VMMemoryProvider.java')
  const reader = read(vmDir + 'VMMemoryReader.java')
  const callProvider = read(vmDir + 'SystemCallProvider.java')
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  const plugin = read('android/app/src/main/java/com/d0j/engine/D0JNativePlugin.java')
  const nativeJs = read('src/lib/native.js')
  const settings = read('src/screens/Settings.jsx')
  const probe = read(vmDir + 'VMStateProbe.java')

  assert.ok(proc.includes('/proc/self/mem'))
  assert.ok(proc.includes('/proc/self/maps'))
  assert.ok(proc.includes('getMethod("pread"'))
  assert.ok(reader.includes('window('))
  assert.ok(probe.includes('reader.window('))
  assert.ok(remote.includes('.vmmem.p'))
  assert.ok(provider.includes('"MEM"'))
  assert.ok(provider.includes('READER_UNAVAILABLE'))
  assert.ok(callProvider.includes('attachReader'))
  assert.ok(plugin.includes('public void vmAttachReader'))
  assert.ok(nativeJs.includes('vmAttachReader:'))
  assert.ok(settings.includes('Attach Reader'))
  assert.equal((manifest.match(/\.vmmem\.p[0-3]/g) || []).length, 4)
})

test('state operations are reachable from JS, settings and the floating menu', () => {
  const nativeJs = read('src/lib/native.js')
  const plugin = read('android/app/src/main/java/com/d0j/engine/D0JNativePlugin.java')
  const provider = read(vmDir + 'SystemCallProvider.java')
  const settings = read('src/screens/Settings.jsx')
  const app = read('src/App.jsx')
  const hud = read('android/app/src/main/java/com/d0j/engine/D0JGameHud.java')

  for (const method of ['vmState', 'vmStateProvider', 'vmBindings', 'vmSaveBindings', 'vmProbe', 'vmAttachReader']) {
    assert.ok(nativeJs.includes(`${method}:`), `missing native.${method}`)
    assert.ok(plugin.includes(`public void ${method}(PluginCall call)`), `missing plugin ${method}`)
  }
  assert.ok(plugin.includes('JSArray'))
  assert.ok(plugin.includes('result.put(key, jsValue('))
  assert.ok(provider.includes('"probeCapture"'))
  assert.ok(provider.includes('"probeDiff"'))
  assert.ok(settings.includes('RUN LINES FROM STATE'))
  assert.ok(settings.includes('Live State Probe'))
  assert.ok(app.includes('mapSnapshotToTable(res)'))
  assert.ok(app.includes("command === 'runLiveLines'"))
  assert.ok(hud.includes('RUN LINES FROM STATE'))
})
