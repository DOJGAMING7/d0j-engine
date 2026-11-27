export default async function autoplayRatimoda(api, log) {
  const cfg = await api.getConfig().catch(() => ({}))

  const options = {
    shots: 3,
    mode: ['Slow', 'Fast', 'Human'].includes(cfg.mode) ? cfg.mode : 'Human',
    autoQueue: true,
    stopOnManual: cfg.stopOnManual !== false,
    seed: 73421,
    aimX: 540,
    aimY: 1260,
    aimCorrection: 1,
    maxWait: 12000,
    retries: 2,
    delay: null
  }

  let seed = options.seed >>> 0
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  const between = (a, b) => a + (b - a) * rnd()
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
  const say = msg => { try { log(String(msg)) } catch {} }

  const isYourTurn = s =>
    s.phase === 'YOUR_TURN' || s.turn === 'you' || s.yourTurn === true

  const isOpponentTurn = s =>
    s.phase === 'OPPONENT_TURN' || s.turn === 'opponent' || s.yourTurn === false

  const isResult = s =>
    s.phase === 'RESULT' ||
    s.phase === 'MATCH_END' ||
    (typeof s.result === 'string' && !s.result.startsWith('tap:'))

  const isManual = s =>
    s.manualInput === true || s.manual === true || s.phase === 'MANUAL'

  function shotDelay() {
    if (options.delay !== null) return options.delay
    if (options.mode === 'Fast') return between(90, 150)
    if (options.mode === 'Slow') return between(550, 750)
    return between(120, 300)
  }

  function aimPoint(state) {
    const err = Number(state.aimError || 0)
    const correction = clamp(-err * 18 * options.aimCorrection, -90, 90)
    return {
      x: clamp(options.aimX + correction + between(-6, 6), 80, 1000),
      y: clamp(options.aimY + between(-8, 8), 200, 1800)
    }
  }

  async function wait(label, predicate, timeout = options.maxWait) {
    for (let attempt = 1; attempt <= options.retries + 1; attempt++) {
      try {
        const state = await api.waitFor(predicate, timeout)
        say(`WAIT ${label}: ok try=${attempt}`)
        return state
      } catch (e) {
        say(`WAIT ${label}: ${String(e?.message || e)} try=${attempt}/${options.retries + 1}`)
        if (attempt > options.retries) throw e
      }
    }
  }

  await api.setConfig({
    autoPlay: true,
    autoQueue: options.autoQueue,
    mode: options.mode,
    queueMode: 'SESSION',
    stopOnManual: options.stopOnManual
  })

  say(`RATIMODA v2: start mode=${options.mode} shots=${options.shots} queue=ON`)

  const report = {
    ok: false,
    shots: 0,
    tapped: [],
    requeued: false,
    mode: options.mode
  }

  try {
    for (let i = 1; i <= options.shots; i++) {
      let state = await api.getState()

      if (options.stopOnManual && isManual(state)) {
        say('STOP: manual input detected')
        break
      }

      if (!isYourTurn(state)) {
        state = await wait(`shot ${i}: your turn`, isYourTurn)
      }

      const aim = aimPoint(state)
      const delay = shotDelay()
      const basePower = Number(state.power ?? cfg.power ?? 74)
      const power = clamp(
        Math.round((Number.isFinite(basePower) ? basePower : 74) + Math.abs(aim.x - options.aimX) / 6),
        0,
        100
      )

      say(`SHOT ${i}: aim=${Math.round(aim.x)},${Math.round(aim.y)} power=${power} delay=${Math.round(delay)}ms`)

      await api.tap(aim.x, aim.y, delay)

      report.tapped.push({
        x: Math.round(aim.x),
        y: Math.round(aim.y),
        power,
        delay: Math.round(delay)
      })
      report.shots++

      await wait(
        `shot ${i}: opponent turn`,
        s => isOpponentTurn(s) || isResult(s),
        Math.min(options.maxWait, 4000)
      )

      const afterShot = await wait(
        `shot ${i}: result or next turn`,
        s => isYourTurn(s) || isResult(s),
        options.maxWait
      )

      if (isResult(afterShot)) {
        say(`RESULT ${i}: ${afterShot.result || 'result screen'}`)
      } else {
        say(`CYCLE ${i}: next turn ready`)
      }
    }

    const finalState = await api.getState()
    const queued = finalState.queue?.queued || 0

    if (options.autoQueue) {
      say(`QUEUE: mode=SESSION queued=${queued}`)
      report.requeued = true
    }

    await api.setConfig({
      autoPlay: false,
      autoQueue: false
    })

    report.ok = report.shots === options.shots

    say(
      `RATIMODA v2: complete (${report.shots}/${options.shots} shots, ` +
      `${report.requeued ? 'queued' : 'no queue'}, simulated only)`
    )

    return report
  } catch (e) {
    await api.setConfig({
      autoPlay: false,
      autoQueue: false
    })

    say(`RATIMODA v2: FAILED ${String(e?.message || e)}`)

    return {
      ...report,
      ok: false,
      error: String(e?.message || e)
    }
  } finally {
    if (typeof api.stopAll === 'function') api.stopAll()
  }
}
