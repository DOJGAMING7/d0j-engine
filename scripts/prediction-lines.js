export default async function predictionLines(api, log) {
  const cfg = await api.getConfig().catch(() => ({}))
  const say = msg => { try { log(String(msg)) } catch {} }

  const power = Math.max(0, Math.min(100, Number(cfg.power ?? 74)))
  const rawSpin = Number(cfg.lineSpin ?? cfg.sideSpin ?? 0)
  const spin = Math.abs(rawSpin) > 1 ? rawSpin / 100 : rawSpin
  const table = await (api.getTable
    ? api.getTable()
    : api.getState().then(s => s.table).catch(() => null)).catch(() => null)
  const balls = Array.isArray(table?.balls) ? table.balls : []
  const cue = table?.cue || { x: 300, y: 660 }
  const plans = api.planShots
    ? await api.planShots({ power, spin }).catch(() => null)
    : null
  const fallback = balls.map(b => ({
    ballId: b.id,
    aim: { x: b.x, y: b.y },
    ghost: null,
    pocket: null,
    cutDeg: 0,
    cueClear: false,
    targetClear: false
  }))
  const shots = Array.isArray(plans?.plans) && plans.plans.length ? plans.plans : fallback

  await api.setConfig({
    showLines: true,
    keepLines: true,
    powerLock: true,
    power,
    lineSpin: cfg.lineSpin ?? 0,
    sideSpin: cfg.sideSpin ?? 0
  })
  if (api.clearLines) await api.clearLines().catch(() => {})

  say(`D0J LINE TEST: start power=${power} spin=${spin} balls=${balls.length} cue=${Math.round(cue.x)},${Math.round(cue.y)}`)
  say('NOTE: local/simulated prediction. Real 8BP live lines need an in-game bridge/patch.')

  const report = {
    ok: false, predictions: 0, lines: 0, balls: balls.length, shots: 0,
    cue: { ...cue }, targets: [], error: null, simulated: true
  }

  try {
    const lines = []

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i]
      const aim = shot.ghost || shot.aim
      const prediction = await api.predict({
        aim,
        targetId: shot.ballId,
        pocketId: shot.pocket?.id,
        power,
        spin
      })
      const target = prediction.target?.id || shot.ballId
      const pocket = prediction.pocket?.id || 'none'
      const cuePoints = prediction.cuePath?.length || 0
      const targetPoints = prediction.targetPath?.length || 0
      const clear = shot.cueClear === true && shot.targetClear === true

      say(`LINE ${i + 1}/${shots.length}: ball=${shot.ballId} aim=${Math.round(aim.x)},${Math.round(aim.y)} target=${target} pocket=${pocket} cuePoints=${cuePoints} targetPoints=${targetPoints} cut=${shot.cutDeg ?? 0} clear=${clear ? 'yes' : 'blocked'}`)
      report.targets.push({ ballId: shot.ballId, target, pocket, cuePoints, targetPoints, cutDeg: shot.cutDeg ?? 0 })

      if (!prediction.ok || cuePoints < 2) {
        throw new Error(`prediction path empty for ball ${shot.ballId}`)
      }

      lines.push({
        ballId: shot.ballId,
        target: prediction.target,
        pocket: prediction.pocket,
        ghost: prediction.ghost,
        cuePath: prediction.cuePath,
        targetPath: prediction.targetPath,
        cutDeg: shot.cutDeg ?? 0,
        cueClear: shot.cueClear === true,
        targetClear: shot.targetClear === true
      })
      report.predictions++
    }

    if (api.setLines) await api.setLines(lines)
    report.lines = lines.length

    if (cfg.lineTestShoot === true) {
      const shootCount = Math.min(3, lines.length)
      for (let i = 0; i < shootCount; i++) {
        const line = lines[i]
        await api.shoot({
          aim: line.ghost,
          targetId: line.ballId,
          pocketId: line.pocket?.id,
          power,
          spin
        })
        report.shots++
        if (typeof api.sleep === 'function') await api.sleep(80)
      }
    }

    const expectedShots = cfg.lineTestShoot === true ? Math.min(3, balls.length) : 0
    report.ok = report.lines === balls.length && report.shots === expectedShots
    say(`D0J LINE TEST: ${report.ok ? 'PASS' : 'FAIL'} (${report.lines}/${balls.length} lines, ${report.shots} shots, simulated)`)
    return report
  } catch (e) {
    report.error = String(e?.message || e)
    say(`D0J LINE TEST: FAILED ${report.error}`)
    return report
  }
}
