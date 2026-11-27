const DEFAULT_STATE = {
  ready: true,
  turn: 'you',
  result: null,
  power: 74,
  spin: 0,
  aimError: 0,
  status: 'SIMULATED',
  queue: { mode: 'ONE', delay: 2, jitter: 0.4, retries: 2, limit: 3, queued: 0, matched: 0, completed: 0, failed: 0 }
}

let state = { ...DEFAULT_STATE, queue: { ...DEFAULT_STATE.queue } }
let config = {
  autoPlay: false,
  mode: 'Slow',
  autoQueue: false,
  queueMode: 'ONE',
  matchLimit: 3,
  queueDelay: 2,
  jitter: 0.4,
  retries: 2,
  stopOnManual: true,
  aimGuide: false,
  targetPreview: false,
  guideOpacity: 70,
  power: 74,
  sideSpin: 0,
  topSpin: 0
}
let listeners = new Set()
let stopped = false
let simTimer = null

function emit() {
  for (const fn of [...listeners]) {
    try { fn({ ...state, queue: { ...state.queue } }) } catch {}
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)))
}

export function createBridge({ onLog = () => {} } = {}) {
  const log = msg => onLog(String(msg))

  const api = {
    async getState() {
      return { ...state, queue: { ...state.queue } }
    },
    async getConfig() {
      return { ...config }
    },
    async setConfig(patch = {}) {
      config = { ...config, ...patch }
      state.power = config.power ?? state.power
      state.spin = config.sideSpin ?? state.spin
      state.queue = {
        ...state.queue,
        mode: config.queueMode ?? state.queue.mode,
        delay: config.queueDelay ?? state.queue.delay,
        jitter: config.jitter ?? state.queue.jitter,
        retries: config.retries ?? state.queue.retries,
        limit: config.matchLimit ?? state.queue.limit
      }
      emit()
      return { ...config }
    },
    async setState(patch = {}) {
      state = { ...state, ...patch, queue: { ...(patch.queue || state.queue) } }
      emit()
      return { ...state }
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    async waitFor(predicate, timeoutMs = 10000) {
      if (stopped) throw new Error('stopped')
      if (predicate(state)) return await api.getState()
      return await new Promise((resolve, reject) => {
        const started = Date.now()
        let done = false
        const cleanup = () => {
          if (done) return
          done = true
          clearInterval(timer)
          unsubscribe()
        }
        const check = () => {
          if (done) return
          if (stopped) { cleanup(); reject(new Error('stopped')); return }
          if (predicate(state)) { cleanup(); resolve(api.getState()); return }
          if (Date.now() - started > timeoutMs) { cleanup(); reject(new Error('timeout')); return }
        }
        const timer = setInterval(check, 50)
        const unsubscribe = api.subscribe(check)
        check()
      })
    },
    async tap(x, y, delay = 50) {
      if (stopped) throw new Error('stopped')
      await sleep(delay)
      state.turn = 'opponent'
      state.result = `tap:${Math.round(x)},${Math.round(y)}`
      state.aimError = Math.max(-2, Math.min(2, (state.aimError || 0) + 0.35))
      emit()
      log(`tap ${Math.round(x)},${Math.round(y)} delay=${Math.round(delay)}ms`)
      return { x, y, delay }
    },
    async swipe(x1, y1, x2, y2, duration = 120) {
      if (stopped) throw new Error('stopped')
      await sleep(duration)
      log(`swipe ${x1},${y1} -> ${x2},${y2}`)
      return true
    },
    sleep(ms) { return sleep(ms) },
    stopAll() {
      stopped = true
      stopSimulation()
      log('stopAll')
    }
  }

  function startSimulation() {
    stopped = false
    if (simTimer) return
    simTimer = setInterval(() => {
      if (stopped) return
      state.turn = state.turn === 'you' ? 'opponent' : 'you'
      state.result = null
      state.queue.queued += 1
      emit()
    }, 2400)
  }

  function stopSimulation() {
    if (simTimer) { clearInterval(simTimer); simTimer = null }
  }

  function reset() {
    stopped = false
    state = { ...DEFAULT_STATE, queue: { ...DEFAULT_STATE.queue } }
    emit()
  }

  return { api, log, getState: api.getState, subscribe: api.subscribe, startSimulation, stopSimulation, reset, getConfig: api.getConfig, setConfig: api.setConfig }
}
