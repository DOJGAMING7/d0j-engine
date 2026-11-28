// Maps a native VM snapshot into the geometry shape used by prediction.js.
// Unknown fields are rejected, never filled with invented positions.

const number = value => {
  if (value === null || value === undefined || value === '') return NaN
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : NaN
}

export function snapshotStatus(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return { ok: false, reason: 'NO_SNAPSHOT' }

  const cueX = number(snapshot.cueX)
  const cueY = number(snapshot.cueY)
  if (!Number.isFinite(cueX) || cueX <= 0 || !Number.isFinite(cueY) || cueY <= 0) {
    return { ok: false, reason: 'CUE_NOT_MEASURED' }
  }

  const balls = Array.isArray(snapshot.balls)
    ? snapshot.balls.filter(ball => ball && ball.active !== false
      && Number.isFinite(number(ball.x)) && Number.isFinite(number(ball.y)))
    : []
  if (!balls.length) return { ok: false, reason: 'BALLS_NOT_MEASURED' }

  const pockets = Array.isArray(snapshot.pockets)
    ? snapshot.pockets.filter(pocket => pocket
      && Number.isFinite(number(pocket.x)) && Number.isFinite(number(pocket.y)))
    : []
  if (!pockets.length) return { ok: false, reason: 'POCKETS_NOT_MEASURED' }

  return {
    ok: true,
    reason: '',
    balls: balls.length,
    pockets: pockets.length,
    source: String(snapshot.source || 'unknown'),
    confidence: Number.isFinite(number(snapshot.confidence)) ? number(snapshot.confidence) : 0,
    simulated: String(snapshot.source || '').includes('demo')
  }
}

export function mapSnapshotToTable(snapshot) {
  const status = snapshotStatus(snapshot)
  if (!status.ok) throw new Error(status.reason)

  return {
    width: Number.isFinite(number(snapshot.width)) ? number(snapshot.width) : 600,
    height: Number.isFinite(number(snapshot.height)) ? number(snapshot.height) : 900,
    ballRadius: Number.isFinite(number(snapshot.ballRadius)) ? number(snapshot.ballRadius) : 11,
    pocketRadius: Number.isFinite(number(snapshot.pocketRadius)) ? number(snapshot.pocketRadius) : 18,
    cue: { x: number(snapshot.cueX), y: number(snapshot.cueY) },
    balls: snapshot.balls
      .filter(ball => ball && ball.active !== false
        && Number.isFinite(number(ball.x)) && Number.isFinite(number(ball.y)))
      .map(ball => ({
        id: String(ball.id || ''),
        x: number(ball.x),
        y: number(ball.y),
        color: typeof ball.color === 'string' ? ball.color : undefined
      })),
    pockets: snapshot.pockets
      .filter(pocket => pocket && Number.isFinite(number(pocket.x)) && Number.isFinite(number(pocket.y)))
      .map(pocket => ({
        id: String(pocket.id || ''),
        x: number(pocket.x),
        y: number(pocket.y)
      }))
  }
}

export function bindingsStatus(binding) {
  if (!binding || binding.status !== 'MEASURED') return { usable: false, reason: 'BINDINGS_UNMEASURED' }
  for (const key of ['cueXOffset', 'cueYOffset', 'ballsArrayOffset', 'ballStride', 'ballXOffset', 'ballYOffset']) {
    if (binding[key] === null || binding[key] === undefined || !Number.isFinite(number(binding[key]))) {
      return { usable: false, reason: `${key.toUpperCase()}_MISSING` }
    }
  }
  return { usable: true, reason: '' }
}
