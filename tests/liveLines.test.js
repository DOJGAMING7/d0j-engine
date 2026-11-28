import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildLiveOverlay, normalizeCalibration, overlayJson } from '../src/lib/liveLines.js'

const root = resolve(import.meta.dirname, '..')
const read = relative => readFileSync(resolve(root, relative), 'utf8')

const snapshot = () => ({
  source: 'demo-simulated',
  cueX: 300,
  cueY: 660,
  balls: [{ id: '1', x: 300, y: 300 }, { id: '9', x: 420, y: 420 }],
  pockets: [{ id: 'TL', x: 0, y: 0 }, { id: 'TM', x: 300, y: 0 }],
  phase: 'YOUR_TURN'
})

test('live overlay rejects snapshots that were not measured', () => {
  assert.equal(buildLiveOverlay(null).reason, 'NO_SNAPSHOT')
  assert.equal(buildLiveOverlay({ balls: [], pockets: [] }).reason, 'CUE_NOT_MEASURED')
  assert.equal(buildLiveOverlay({ cueX: 1, cueY: 2 }).reason, 'BALLS_NOT_MEASURED')
  assert.equal(buildLiveOverlay({ cueX: 1, cueY: 2, balls: [{ x: 1, y: 1 }] }).reason, 'POCKETS_NOT_MEASURED')
})

test('live overlay maps measured state into screen-space line specs', () => {
  const built = buildLiveOverlay(snapshot(), { calibration: { x: 100, y: 50, width: 1200, height: 1800 } })
  assert.equal(built.ok, true)
  assert.equal(built.balls, 2)
  assert.equal(built.simulated, true)
  assert.deepEqual(normalizeCalibration(built.calibration), { x: 100, y: 50, width: 1200, height: 1800 })

  const types = new Set(built.lines.map(line => line.type))
  for (const type of ['path', 'circle']) assert.ok(types.has(type))
  assert.equal(types.has('text'), false, 'labels are opt-in so the overlay stays clean')
  const labelled = buildLiveOverlay(snapshot(), { labels: true, calibration: { x: 100, y: 50, width: 1200, height: 1800 } })
  assert.ok(labelled.lines.some(line => line.type === 'text'))

  const cueLine = built.lines.find(line => line.id === 'cue-1')
  assert.deepEqual(cueLine.points[0], { x: 700, y: 1370 })
  assert.equal(cueLine.color, '#FFFFFF')
  const targetLine = built.lines.find(line => line.id === 'target-1')
  assert.equal(targetLine.color, '#FFD400')
  const ghostLine = built.lines.find(line => line.id === 'ghost-1')
  assert.ok(ghostLine && Number.isFinite(ghostLine.x) && Number.isFinite(ghostLine.y))
  assert.equal(ghostLine.color, '#FFD400')
  for (const line of built.lines) {
    if (line.type === 'path') assert.equal(line.points.length, 2)
  }
})

test('finding indicator and calibration fallbacks stay explicit', () => {
  const base = buildLiveOverlay(snapshot(), { calibration: { x: 0, y: 0, width: 600, height: 900 } })
  const finding = buildLiveOverlay({ ...snapshot(), phase: 'FINDING_SHOT' }, {
    finding: true,
    calibration: { x: 0, y: 0, width: 600, height: 900 }
  })
  assert.equal(base.lines.some(line => line.id === 'finding'), false)
  assert.equal(finding.lines.some(line => line.id === 'finding'), true)
  assert.deepEqual(normalizeCalibration({ x: 'bad', width: -4 }), { x: 0, y: 0, width: 600, height: 900 })

  const json = JSON.parse(overlayJson(base.lines))
  assert.equal(json.lines.length, base.lines.length)
})

test('step 5 in-window line layer, bridge and controls are wired', () => {
  const layer = read('android/app/src/main/java/com/d0j/engine/D0JLineLayer.java')
  const hud = read('android/app/src/main/java/com/d0j/engine/D0JGameHud.java')
  const service = read('android/app/src/main/java/com/d0j/engine/D0JSessionService.java')
  const plugin = read('android/app/src/main/java/com/d0j/engine/D0JNativePlugin.java')
  const nativeJs = read('src/lib/native.js')
  const settings = read('src/screens/Settings.jsx')
  const menu = read('src/components/ModMenu.jsx')
  const app = read('src/App.jsx')

  assert.ok(layer.includes('ACTION_UPDATE_LINES') === false)
  assert.ok(layer.includes('public void setSpecs'))
  assert.ok(layer.includes('FLAG_NOT_TOUCHABLE') === false)
  assert.ok(layer.includes('canvas.drawPath'))
  assert.ok(layer.includes('canvas.drawCircle'))
  assert.ok(layer.includes('canvas.drawText'))
  assert.ok(service.includes('ACTION_UPDATE_LINES'))
  assert.ok(service.includes('D0JGameHud.pushLines'))
  assert.ok(hud.includes('public static final String ACTION_LINES'))
  assert.ok(hud.includes('installLines()'))
  assert.ok(hud.includes('lines.setSpecs'))
  assert.ok(hud.includes('START LIVE LINES'))
  assert.ok(hud.includes('STOP LIVE LINES'))
  assert.ok(!hud.includes('FLAG_NOT_TOUCHABLE'))
  assert.ok(plugin.includes('public void setOverlayLines'))
  assert.ok(plugin.includes('public void clearOverlayLines'))
  assert.ok(nativeJs.includes('setOverlayLines:'))
  assert.ok(nativeJs.includes('clearOverlayLines:'))
  assert.ok(settings.includes('In-Window Lines'))
  assert.ok(menu.includes('START LIVE LINES'))
  assert.ok(app.includes("command === 'liveStart'"))
  assert.ok(app.includes("command === 'liveStop'"))
  assert.ok(app.includes('buildLiveOverlay(res'))
  assert.ok(app.includes('setOverlayLines(overlayJson'))
})
