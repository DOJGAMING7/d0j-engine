export const DEFAULT_TABLE = {
  width: 600,
  height: 900,
  ballRadius: 11,
  pocketRadius: 18,
  cue: { x: 300, y: 660 },
  balls: [
    { id: '1', x: 300, y: 300, color: '#FFD166' },
    { id: '9', x: 420, y: 420, color: '#FFD166' },
    { id: '2', x: 180, y: 420, color: '#00C8FF' }
  ],
  pockets: [
    { id: 'TL', x: 0, y: 0 },
    { id: 'TM', x: 300, y: 0 },
    { id: 'TR', x: 600, y: 0 },
    { id: 'BL', x: 0, y: 900 },
    { id: 'BM', x: 300, y: 900 },
    { id: 'BR', x: 600, y: 900 }
  ]
}

export function createDefaultTable() {
  return {
    ...DEFAULT_TABLE,
    cue: { ...DEFAULT_TABLE.cue },
    balls: DEFAULT_TABLE.balls.map(b => ({ ...b })),
    pockets: DEFAULT_TABLE.pockets.map(p => ({ ...p }))
  }
}

export function cloneTable(table) {
  if (!table) return createDefaultTable()
  return {
    ...table,
    cue: { ...table.cue },
    balls: (table.balls || []).map(b => ({ ...b })),
    pockets: (table.pockets || []).map(p => ({ ...p }))
  }
}

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y })
const scale = (v, s) => ({ x: v.x * s, y: v.y * s })
const length = v => Math.hypot(v.x, v.y) || 1
const unit = v => scale(v, 1 / length(v))
const dot = (a, b) => a.x * b.x + a.y * b.y
const cross = (a, b) => a.x * b.y - a.y * b.x

// The native mod menu writes spin as -100..100, the demo slider writes -1..1.
// Keep one internal unit so both produce the same curve.
export function normalizeSpin(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? (Math.abs(n) > 1 ? n / 100 : n) : 0
}

function clampPoint(p, table) {
  const r = table.ballRadius || 10
  return {
    x: Math.max(r, Math.min((table.width || 600) - r, p.x)),
    y: Math.max(r, Math.min((table.height || 900) - r, p.y))
  }
}

function distanceToSegment(p, a, b) {
  const ab = sub(b, a)
  const len2 = dot(ab, ab)
  if (!len2) return length(sub(p, a))
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2))
  return length(sub(p, add(a, scale(ab, t))))
}

function pathIsClear(table, from, to, ignoreIds, radius) {
  for (const ball of table.balls || []) {
    if (ignoreIds.includes(String(ball.id))) continue
    if (distanceToSegment(ball, from, to) < radius * 1.85) return false
  }
  return true
}

function insideCushions(point, table, margin) {
  const w = table.width || 600
  const h = table.height || 900
  return point.x >= margin && point.x <= w - margin && point.y >= margin && point.y <= h - margin
}

function findTargetBall(table, origin, dir) {
  const radius = table.ballRadius || 11
  let best = null
  let bestProjection = Infinity

  for (const ball of table.balls || []) {
    const rel = sub(ball, origin)
    const projection = dot(rel, dir)
    const offset = Math.abs(cross(dir, rel))
    if (projection > radius && offset < radius * 2.8 && projection < bestProjection) {
      best = ball
      bestProjection = projection
    }
  }

  return best
}

function choosePocket(table, ball, dir) {
  let best = null
  let bestScore = -Infinity

  for (const pocket of table.pockets || []) {
    const toPocket = sub(pocket, ball)
    if (dot(unit(toPocket), dir) <= 0) continue
    const score = dot(unit(toPocket), dir) - Math.abs(cross(dir, unit(toPocket))) * 0.35
    if (score > bestScore) {
      bestScore = score
      best = pocket
    }
  }

  return best
}

function curveBetween(a, b, spin, amount = 26) {
  const steps = 20
  const dir = unit(sub(b, a))
  const perp = { x: -dir.y, y: dir.x }

  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    const offset = spin * amount * Math.sin(Math.PI * t)
    return {
      x: a.x + (b.x - a.x) * t + perp.x * offset,
      y: a.y + (b.y - a.y) * t + perp.y * offset
    }
  })
}

// Pure geometry: one shot per object ball, including the cue-ball path that
// reaches the ghost ball. No game memory and no build-dependent values here.
export function planShotLines(tableInput, options = {}) {
  const table = cloneTable(tableInput)
  const radius = table.ballRadius || 11
  const cue = table.cue || { x: 300, y: 660 }
  const spin = normalizeSpin(options.spin ?? options.sideSpin ?? options.lineSpin ?? 0)
  const power = Math.max(0, Math.min(100, Number(options.power ?? 74)))
  const plans = []

  for (const ball of table.balls || []) {
    const candidates = []

    for (const pocket of table.pockets || []) {
      const toPocket = sub(pocket, ball)
      const pocketDistance = length(toPocket)
      if (pocketDistance < radius * 2) continue
      const pocketDir = scale(toPocket, 1 / pocketDistance)
      const ghost = sub(ball, scale(pocketDir, radius * 2))
      if (!insideCushions(ghost, table, radius * 0.5)) continue

      const toGhost = sub(ghost, cue)
      const cueDistance = length(toGhost)
      if (cueDistance < radius * 2) continue
      const cueDir = scale(toGhost, 1 / cueDistance)
      const cutDot = Math.max(0, Math.min(1, dot(cueDir, pocketDir)))
      if (cutDot < 0.12) continue

      const cueClear = pathIsClear(table, cue, ghost, [ball.id], radius)
      const targetClear = pathIsClear(table, ball, pocket, [ball.id], radius)
      const score = cutDot * 100 - pocketDistance * 0.05 - cueDistance * 0.01 + (cueClear ? 20 : 0) + (targetClear ? 20 : 0)
      candidates.push({ pocket, ghost, cueDir, pocketDir, cutDot, cueClear, targetClear, score, pocketDistance })
    }

    candidates.sort((a, b) => b.score - a.score)
    const best = candidates[0]
    if (!best) continue

    plans.push({
      ballId: ball.id,
      aim: { ...best.ghost },
      ghost: { ...best.ghost },
      pocket: { ...best.pocket },
      ball: { ...ball },
      cue: { ...cue },
      cutDeg: Math.round(Math.acos(best.cutDot) * 180 / Math.PI),
      cueClear: best.cueClear,
      targetClear: best.targetClear,
      power,
      spin
    })
  }

  return { ok: plans.length > 0, cue: { ...cue }, power, spin, plans, simulated: true }
}

export function computePrediction(tableInput, aimPoint, options = {}) {
  // Flexible signature:
  // computePrediction({ table, aim, power, spin })
  // computePrediction(table, aimPoint, { power, spin, targetId, pocketId })
  // When targetId is supplied, aimPoint is the ghost/contact point.
  let tableSrc = tableInput
  let aimSrc = aimPoint
  let opts = options
  if (tableInput && tableInput.table && !Array.isArray(tableInput.balls)) {
    tableSrc = tableInput.table
    aimSrc = tableInput.aim || tableInput.aimPoint || aimPoint
    opts = { ...tableInput, ...options }
  }

  const table = cloneTable(tableSrc)
  const origin = table.cue || { x: 300, y: 660 }
  const spin = normalizeSpin(opts.spin ?? opts.sideSpin ?? opts.lineSpin ?? 0)
  const power = Math.max(0, Math.min(100, Number(opts.power ?? 74)))
  const guideLength = Math.min(table.height || 900, 120 + power * 5.4)

  let target = null
  let ghost = null
  let pocket = null
  let dir = null

  if (opts.targetId !== undefined && opts.targetId !== null) {
    target = (table.balls || []).find(b => String(b.id) === String(opts.targetId)) || null
    if (!target) {
      return { ok: false, aim: clampPoint(aimSrc || origin, table), dir: { x: 0, y: -1 }, origin, target: null, ghost: null, pocket: null, power, spin, cuePath: [], path: [], targetPath: [], guideLength, reason: 'TARGET_NOT_FOUND' }
    }
    pocket = (table.pockets || []).find(p => String(p.id) === String(opts.pocketId)) || null
    if (!pocket) {
      const roughDir = unit(sub(aimSrc || origin, origin))
      pocket = choosePocket(table, target, roughDir)
    }
    ghost = pocket
      ? sub(target, scale(unit(sub(pocket, target)), (table.ballRadius || 11) * 2))
      : clampPoint(aimSrc || target, table)
    dir = unit(sub(ghost, origin))
  } else {
    const aim = clampPoint(aimSrc || { x: origin.x, y: origin.y - 100 }, table)
    dir = unit(sub(aim, origin))
    target = findTargetBall(table, origin, dir)
    ghost = target ? sub(target, scale(dir, (table.ballRadius || 11) * 2)) : null
    pocket = target ? choosePocket(table, target, dir) : null
  }

  const aim = ghost || clampPoint(aimSrc || origin, table)
  const aimEnd = ghost || clampPoint(add(origin, scale(dir, guideLength)), table)
  const targetEnd = pocket || clampPoint(add(aimEnd, scale(dir, guideLength)), table)
  const cuePath = curveBetween(origin, aimEnd, spin)
  const targetPath = target ? curveBetween(target, targetEnd, -spin * 0.35, 12) : []

  return {
    ok: cuePath.length > 1 && !!target && !!pocket,
    aim,
    dir,
    origin,
    target,
    ghost,
    pocket,
    power,
    spin,
    cuePath,
    path: cuePath,
    targetPath,
    guideLength,
    reason: target ? (pocket ? null : 'NO_POCKET') : 'NO_TARGET'
  }
}

export function applyPrediction(tableInput, prediction, options = {}) {
  const table = cloneTable(tableInput)
  const power = Math.max(0, Math.min(100, Number(options.power ?? prediction?.power ?? 74)))
  const balls = table.balls.map(b => ({ ...b }))
  const target = balls.find(b => b.id === prediction?.target?.id)

  if (target && prediction?.pocket) {
    const toPocket = sub(prediction.pocket, target)
    const distance = length(toPocket)
    const travel = Math.min(distance, 70 + power * 4.2)
    const moved = clampPoint(add(target, scale(unit(toPocket), travel)), table)
    const potted = distance - travel <= (table.pocketRadius || 18) * 1.4

    if (potted) {
      balls.splice(balls.indexOf(target), 1)
    } else {
      Object.assign(target, moved)
    }

    table.cue = clampPoint(prediction?.ghost || table.cue, table)
  } else {
    const dir = prediction?.dir || { x: 0, y: -1 }
    table.cue = clampPoint(add(table.cue, scale(dir, 45 + power * 3)), table)
  }

  table.balls = balls
  return table
}
