// Pure step-6 decision logic. It only uses coordinates already mapped by the
// live overlay; any missing coordinate rejects the shot instead of guessing.

const num = value => {
  if (value === null || value === undefined || value === '') return NaN
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : NaN
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const point = value => value && Number.isFinite(num(value.x)) && Number.isFinite(num(value.y))

function pathLength(line) {
  const points = line?.points || []
  let total = 0
  for (let i = 1; i < points.length; i++) {
    if (!point(points[i]) || !point(points[i - 1])) continue
    total += Math.hypot(num(points[i].x) - num(points[i - 1].x), num(points[i].y) - num(points[i - 1].y))
  }
  return total
}

export function collectShots(built) {
  if (!built?.ok || !Array.isArray(built.lines)) return []
  const byId = new Map(built.lines.filter(line => line?.id).map(line => [line.id, line]))
  const shots = []
  for (const line of built.lines) {
    if (!line?.id?.startsWith('cue-')) continue
    const id = line.id.slice(4)
    const ghost = byId.get(`ghost-${id}`)
    const pocket = byId.get(`pocket-${id}`)
    if (!point(line.points?.[0]) || !point(ghost) || !point(pocket)) continue
    shots.push({
      id,
      cuePath: line,
      ghost,
      pocket,
      label: byId.get(`label-${id}`)?.text || id,
      distance: pathLength(line)
    })
  }
  return shots
}

export function chooseShot(built, config = {}, state = {}) {
  const shots = collectShots(built)
  if (!shots.length) return { ok: false, reason: 'NO_MAPPED_SHOT' }

  const phase = String(state.phase || '').toUpperCase()
  let group = 'any'
  if (phase.includes('EIGHT') || phase.includes('8BALL')) group = 'eight'
  else if (phase.includes('STRIPE')) group = 'stripe'
  else if (phase.includes('SOLID')) group = 'solid'

  let pool = shots
  if (group === 'eight') pool = shots.filter(shot => shot.id === '8')
  else if (group === 'stripe') pool = shots.filter(shot => num(shot.id) >= 9)
  else if (group === 'solid') pool = shots.filter(shot => num(shot.id) >= 1 && num(shot.id) <= 7)
  else if (config.prioritize9 === true) {
    const nines = shots.filter(shot => shot.id === '9')
    if (nines.length) pool = nines
  }

  const golden = clamp(num(config.goldenTarget), 0, 4)
  if (group === 'any' && golden > 0) {
    const preferred = pool.filter(shot => shot.id === String(golden) || shot.label === String(golden))
    if (preferred.length) pool = preferred
  }

  if (!pool.length) return { ok: false, reason: 'NO_GROUP_TARGET', group }
  pool = [...pool].sort((a, b) => a.distance - b.distance)
  return { ok: true, shot: pool[0], group, reason: '' }
}

export function planInputShot(built, shot, config = {}) {
  const from = shot?.cuePath?.points?.[0]
  const to = shot?.ghost
  if (!point(from) || !point(to)) return { ok: false, reason: 'NO_SCREEN_COORDS' }

  const power = clamp(num(config.power) || 74, 1, 100)
  const dx = num(to.x) - num(from.x)
  const dy = num(to.y) - num(from.y)
  const distance = Math.hypot(dx, dy)
  if (distance < 4) return { ok: false, reason: 'ZERO_LENGTH_SWIPE' }

  const overshoot = 0.35 + (power / 100) * 0.9
  const mode = config.autoPlayMode || 'Pro Fast'
  const duration = mode === 'Pro Player' ? 320 : mode === 'Fast Mode' ? 110 : 190
  return {
    ok: true,
    target: shot.id,
    power,
    mode,
    swipe: {
      x1: num(from.x),
      y1: num(from.y),
      x2: num(from.x) + dx * overshoot,
      y2: num(from.y) + dy * overshoot,
      duration
    }
  }
}

export function planHumanShot(built, shot, config = {}, motion = null) {
  const base = planInputShot(built, shot, config)
  if (!base.ok) return base
  const from = shot?.cuePath?.points?.[0]
  const to = shot?.ghost
  if (!motion || typeof motion.plan !== 'function') return { ...base, path: null, profile: 'flat' }
  const difficulty = typeof motion.difficulty === 'function'
    ? motion.difficulty(shot.distance, shot) : 0.5
  const planned = motion.plan({ from, to, config, shot, difficulty })
  if (!planned?.ok) return { ...base, path: null, profile: 'flat' }
  return {
    ...planned,
    swipe: base.swipe,
    path: { points: planned.points }
  }
}

export function shotSignature(shot, config = {}) {
  return `${shot?.id || ''}:${config.power || 0}:${config.lineSpin || 0}:${shot?.pocket?.id || ''}`
}

export function queueSteps(config = {}, taps = {}) {
  if (config.autoQueue !== true) return []
  const steps = []
  const wait = clamp(num(config.queueDelay) || 2, 0, 30) * 1000
  const jitter = Math.max(0, num(config.jitter) || 0) * 500
  const queuePoint = taps.queue
  if (point(queuePoint)) steps.push({ action: 'tap', x: num(queuePoint.x), y: num(queuePoint.y), wait: wait + jitter })
  const table = config.queueTable || config.tableProfile || 'London'
  const tablePoint = taps.tables?.[table]
  if (point(tablePoint)) steps.push({ action: 'tap', x: num(tablePoint.x), y: num(tablePoint.y), wait: 600 })
  return steps
}
