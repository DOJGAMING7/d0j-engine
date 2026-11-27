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

function clampPoint(p, table) {
  const r = table.ballRadius || 10
  return {
    x: Math.max(r, Math.min((table.width || 600) - r, p.x)),
    y: Math.max(r, Math.min((table.height || 900) - r, p.y))
  }
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
    const offset = Number(spin || 0) * amount * Math.sin(Math.PI * t)
    return {
      x: a.x + (b.x - a.x) * t + perp.x * offset,
      y: a.y + (b.y - a.y) * t + perp.y * offset
    }
  })
}

export function computePrediction(tableInput, aimPoint, options = {}) {
  const table = cloneTable(tableInput)
  const origin = table.cue
  const aim = clampPoint(aimPoint || { x: origin.x, y: origin.y - 100 }, table)
  const dir = unit(sub(aim, origin))
  const spin = Number(options.spin ?? options.sideSpin ?? 0)
  const power = Math.max(0, Math.min(100, Number(options.power ?? 74)))
  const guideLength = Math.min(table.height || 900, 120 + power * 5.4)

  const target = findTargetBall(table, origin, dir)
  const ghost = target
    ? sub(target, scale(dir, (table.ballRadius || 11) * 2))
    : null
  const aimEnd = ghost || clampPoint(add(origin, scale(dir, guideLength)), table)
  const pocket = target ? choosePocket(table, target, dir) : null
  const targetEnd = pocket || clampPoint(add(aimEnd, scale(dir, guideLength)), table)

  return {
    aim,
    dir,
    origin,
    target,
    ghost,
    pocket,
    power,
    spin,
    cuePath: curveBetween(origin, aimEnd, spin),
    targetPath: target ? curveBetween(target, targetEnd, -spin * 0.35, 12) : [],
    guideLength
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
