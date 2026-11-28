// Human-style motion profile for the personal autoplay client.
// It shapes the *touch path* only: every coordinate still comes from the
// measured/calibrated overlay, so nothing about the game state is invented.

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const num = value => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : NaN
}

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MODE_DURATION = {
  'Fast Mode': 320,
  'Pro Fast': 700,
  'Pro Player': 1250,
  Human: 1500
}

export function createHumanMotion(seed = Date.now()) {
  const rng = mulberry32(Number(seed) || 1)
  const style = {
    aimSpeed: 0.82 + rng() * 0.46,
    correctionBias: 1 + Math.floor(rng() * 2),
    jitter: 1.1 + rng() * 1.7,
    hesitation: 0.35 + rng() * 0.5,
    arc: (rng() - 0.5) * 0.07,
    pressure: 0.44 + rng() * 0.14,
    size: 0.92 + rng() * 0.22,
    fatiguePhase: rng() * Math.PI * 2
  }

  return {
    style,
    shots: 0,
    rng,

    reactionDelay(difficulty = 0.5) {
      return Math.round(500 + rng() * 2100 + clamp(difficulty, 0, 1) * 450)
    },

    difficulty(distance, shot = {}) {
      const length = clamp(num(distance) / 900, 0, 1)
      const eight = String(shot.id) === '8' ? 0.22 : 0
      const sparse = num(shot.distance) > 700 ? 0.1 : 0
      return clamp(length * 0.72 + eight + sparse, 0, 1)
    },

    plan({ from, to, config = {}, shot = {}, difficulty = 0.5 }) {
      if (!from || !to || !Number.isFinite(num(from.x)) || !Number.isFinite(num(to.x))) {
        return { ok: false, reason: 'NO_SCREEN_COORDS' }
      }

      const mode = config.mode === 'Human' ? 'Human' : (config.autoPlayMode || 'Pro Fast')
      const dx = num(to.x) - num(from.x)
      const dy = num(to.y) - num(from.y)
      const distance = Math.hypot(dx, dy)
      if (distance < 4) return { ok: false, reason: 'ZERO_LENGTH_SWIPE' }

      const ux = dx / distance
      const uy = dy / distance
      const px = -uy
      const py = ux
      const shots = this.shots++
      const fatigue = 1 + 0.09 * Math.sin(shots * 0.17 + style.fatiguePhase)
      const duration = clamp(
        (MODE_DURATION[mode] || MODE_DURATION['Pro Fast']) * style.aimSpeed * fatigue * (0.92 + difficulty * 0.36),
        120,
        3200
      )

      const power = clamp((num(config.power) || 74) + (rng() - 0.5) * 9, 20, 100)
      const overshootPx = (4 + rng() * 9 + difficulty * 9) * (0.8 + power / 220)
      const peakX = num(to.x) + ux * overshootPx
      const peakY = num(to.y) + uy * overshootPx
      let corrections = Math.min(4, style.correctionBias + (difficulty > 0.62 ? 1 : 0))
      if (mode === 'Fast Mode') corrections = Math.min(1, corrections)
      const mistake = rng() < 0.035 && config.humanMistakes !== false
      if (mistake) corrections = Math.max(0, corrections - 1)

      const approachCount = clamp(Math.round(duration / 42), 10, 38)
      const points = []
      let noise = 0
      let pressureNoise = 0
      let sizeNoise = 0
      const rawDelays = []

      for (let i = 0; i < approachCount; i++) {
        const t = i / (approachCount - 1)
        const eased = 0.5 - 0.5 * Math.cos(Math.PI * t)
        noise = noise * 0.74 + (rng() - 0.5) * 0.52
        pressureNoise = pressureNoise * 0.8 + (rng() - 0.5) * 0.12
        sizeNoise = sizeNoise * 0.82 + (rng() - 0.5) * 0.1
        const arc = Math.sin(Math.PI * eased) * style.arc * distance
        const wobble = noise * style.jitter * (1 + difficulty * 0.8)
        points.push({
          x: num(from.x) + (peakX - num(from.x)) * eased + px * (arc + wobble),
          y: num(from.y) + (peakY - num(from.y)) * eased + py * (arc + wobble),
          delay: 0,
          pressure: clamp(style.pressure + pressureNoise, 0.15, 0.85),
          size: clamp(style.size + sizeNoise, 0.7, 1.3)
        })
        rawDelays.push((0.42 + 1.45 * Math.sin(Math.PI * t)) * (0.82 + rng() * 0.36))
      }

      const rawTotal = rawDelays.reduce((sum, value) => sum + value, 0)
      for (let i = 0; i < points.length; i++) points[i].delay = Math.max(8, Math.round(duration * rawDelays[i] / rawTotal))
      if (mode !== 'Fast Mode' && approachCount > 8) {
        const at = 2 + Math.floor(rng() * (approachCount - 4))
        points[at].delay += Math.round((180 + rng() * 480) * style.hesitation)
      }

      for (let c = 1; c <= corrections; c++) {
        const residual = (c % 2 === 1 ? -1 : 1) * overshootPx * Math.pow(0.46, c) * (0.55 + rng() * 0.7)
        const endX = num(to.x) + ux * residual
        const endY = num(to.y) + uy * residual
        for (let i = 1; i <= 3; i++) {
          const t = i / 3
          noise = noise * 0.7 + (rng() - 0.5) * 0.4
          points.push({
            x: points[points.length - 1].x + (endX - points[points.length - 1].x) * t + px * noise * style.jitter,
            y: points[points.length - 1].y + (endY - points[points.length - 1].y) * t + py * noise * style.jitter,
            delay: Math.max(14, Math.round(35 + rng() * 80)),
            pressure: clamp(style.pressure + pressureNoise * 0.6, 0.15, 0.85),
            size: clamp(style.size + sizeNoise * 0.6, 0.7, 1.3)
          })
        }
      }

      const microCount = mistake ? 1 : 3 + Math.floor(rng() * 4)
      for (let i = 0; i < microCount; i++) {
        noise = noise * 0.6 + (rng() - 0.5) * 0.3
        const amplitude = (1 + rng() * 2.2) * (1 - i / (microCount + 1))
        points.push({
          x: num(to.x) + px * noise * style.jitter + ux * amplitude * (rng() - 0.5),
          y: num(to.y) + py * noise * style.jitter + uy * amplitude * (rng() - 0.5),
          delay: Math.round(45 + rng() * 120),
          pressure: clamp(style.pressure + pressureNoise * 0.4, 0.15, 0.85),
          size: clamp(style.size + sizeNoise * 0.4, 0.7, 1.3)
        })
      }
      if (mistake) points.pop()

      // First point is the down event; its delay is the post-think settle time.
      points[0].delay = Math.round(20 + rng() * 90)
      return {
        ok: true,
        target: shot.id || '',
        mode,
        profile: 'human',
        power,
        difficulty,
        overshootPx,
        corrections,
        mistake,
        approachPoints: approachCount,
        finalError: Math.hypot(points[points.length - 1].x - num(to.x), points[points.length - 1].y - num(to.y)),
        durationMs: points.reduce((sum, p) => sum + p.delay, 0),
        points
      }
    }
  }
}
