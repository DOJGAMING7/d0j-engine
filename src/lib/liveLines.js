// Turns a measured VM snapshot into screen-space line specs for the floating
// overlay. No position is invented: incomplete snapshots are rejected.

import { planShotLines } from './prediction.js'
import { mapSnapshotToTable, snapshotStatus } from './liveState.js'

const number = value => {
  if (value === null || value === undefined || value === '') return NaN
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : NaN
}

export const DEFAULT_CALIBRATION = { x: 0, y: 0, width: 600, height: 900 }

// Stable per-ball colours so a ball keeps the same line colour between shots.
// Cue stays white; the 8 ball uses a high-contrast silver so it reads on blue.
export const BALL_COLORS = {
  CUE: '#FFFFFF',
  '1': '#FFD400',
  '2': '#1E88E5',
  '3': '#E53935',
  '4': '#8E24AA',
  '5': '#FB8C00',
  '6': '#43A047',
  '7': '#8D6E63',
  '8': '#ECEFF1',
  '9': '#FFF176',
  '10': '#64B5F6',
  '11': '#EF5350',
  '12': '#AB47BC',
  '13': '#FFA726',
  '14': '#66BB6A',
  '15': '#A1887F'
}

export function colorForBall(ballId) {
  return BALL_COLORS[String(ballId || '').toUpperCase()] || '#39FF14'
}

export function normalizeCalibration(input) {
  const values = {}
  for (const key of Object.keys(DEFAULT_CALIBRATION)) {
    const parsed = number(input?.[key])
    values[key] = Number.isFinite(parsed) ? parsed : DEFAULT_CALIBRATION[key]
  }
  if (values.width < 1) values.width = DEFAULT_CALIBRATION.width
  if (values.height < 1) values.height = DEFAULT_CALIBRATION.height
  return values
}

export function buildLiveOverlay(snapshot, options = {}) {
  const status = snapshotStatus(snapshot)
  if (!status.ok) return { ok: false, reason: status.reason, lines: [] }

  const table = mapSnapshotToTable(snapshot)
  const power = Number.isFinite(number(options.power)) ? number(options.power) : 74
  const spin = Number.isFinite(number(options.spin)) ? number(options.spin) : 0
  const plan = planShotLines(table, { power, spin })
  if (!plan.ok || !plan.plans.length) return { ok: false, reason: 'NO_SHOT_PLAN', lines: [] }

  const rect = normalizeCalibration(options.calibration)
  const scaleX = rect.width / (table.width || 600)
  const scaleY = rect.height / (table.height || 900)
  const map = point => ({
    x: Math.round(rect.x + (point?.x || 0) * scaleX),
    y: Math.round(rect.y + (point?.y || 0) * scaleY)
  })

  const lines = []
  for (const shot of plan.plans) {
    const id = String(shot.ballId || '')
    const ballColor = options.targetColor || colorForBall(id)
    const cueColor = options.cueColor || '#FFFFFF'
    lines.push({
      id: `cue-${id}`,
      type: 'path',
      points: [map(shot.cue), map(shot.ghost)],
      color: cueColor,
      width: 2.2,
      alpha: 0.9,
      glow: true
    })
    lines.push({
      id: `target-${id}`,
      type: 'path',
      points: [map(shot.ghost), map(shot.pocket)],
      color: ballColor,
      width: 1.9,
      alpha: 0.82
    })
    lines.push({
      id: `ghost-${id}`,
      type: 'circle',
      ...map(shot.ghost),
      radius: 7,
      color: ballColor,
      width: 2,
      alpha: 0.95
    })
    lines.push({
      id: `pocket-${id}`,
      type: 'circle',
      ...map(shot.pocket),
      radius: Math.max(11, Math.round(16 * ((scaleX + scaleY) / 2))),
      color: ballColor,
      width: 2,
      alpha: 0.85
    })
    if (options.labels === true && id) {
      const label = map(shot.ball)
      lines.push({
        id: `label-${id}`,
        type: 'text',
        x: label.x + 12,
        y: label.y - 12,
        text: id,
        color: '#FFFFFF'
      })
    }
  }

  if (options.finding) {
    lines.push({
      id: 'finding',
      type: 'circle',
      ...map(table.cue),
      radius: 18,
      color: '#FFFFFF',
      width: 2,
      alpha: 0.85
    })
  }

  return {
    ok: true,
    reason: '',
    lines,
    balls: plan.plans.length,
    source: status.source,
    simulated: status.simulated,
    confidence: status.confidence,
    calibration: rect
  }
}

export function overlayJson(specs) {
  return JSON.stringify({ lines: Array.isArray(specs) ? specs : [] })
}
