import { DEFAULT_CONFIG, normalizeMode } from './config.js'
import { applyPrediction, cloneTable, computePrediction, createDefaultTable } from './prediction.js'

const DEFAULT_STATE = {
  ready: true,
  phase: 'YOUR_TURN',
  turn: 'you',
  result: null,
  power: 74,
  spin: 0,
  aimError: 0,
  manualInput: false,
  status: 'SIMULATED',
  table: createDefaultTable(),
  lastPrediction: null,
  queue: { mode: 'ONE', delay: 2, jitter: 0.4, retries: 2, limit: 3, queued: 0, matched: 0, completed: 0, failed: 0 }
}

let state = { ...DEFAULT_STATE, queue: { ...DEFAULT_STATE.queue } }
let config = { ...DEFAULT_CONFIG }
let listeners = new Set()
let stopped = false
let simTimer = null

function cloneState(s) {
  return {
    ...s,
    queue: { ...s.queue },
    table: cloneTable(s.table)
  }
}

function emit() {
  const snapshot = cloneState(state)
  for (const fn of [...listeners]) {
    try { fn(snapshot) } catch {}
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)))
}

export function createBridge({ onLog = () => {} } = {}) {
  const log = msg => onLog(String(msg))

  const api = {
    async getState() {
      return cloneState(state)
    },
    async getConfig() {
      return { ...config }
    },
    async setConfig(patch = {}) {
      const nextPatch = { ...patch }
      if (nextPatch.autoPlayMode && !nextPatch.mode) nextPatch.mode = normalizeMode(nextPatch.autoPlayMode)
      config = { ...config, ...nextPatch }
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
      state = {
        ...state,
        ...patch,
        queue: { ...(patch.queue || state.queue) },
        table: patch.table ? cloneTable(patch.table) : state.table
      }
      emit()
      return cloneState(state)
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
      state.phase = 'OPPONENT_TURN'
      state.turn = 'opponent'
      state.result = `tap:${Math.round(x)},${Math.round(y)}`
      state.manualInput = false
      state.aimError = Math.max(-2, Math.min(2, Number(state.aimError || 0) + 0.35))
      emit()
      log(`tap ${Math.round(x)},${Math.round(y)} delay=${Math.round(delay)}ms`)
      return { x, y, delay }
    },
    async predict(options = {}) {
      const spin = Number(options.spin ?? config.lineSpin ?? 0)
      const power = Number(options.power ?? config.power ?? 74)
      const prediction = computePrediction(state.table, options.aim || options, { spin, power })
      state.lastPrediction = {
        ...prediction,
        cuePath: undefined,
        targetPath: undefined
      }
      return prediction
    },
    async shoot(options = {}) {
      if (stopped) throw new Error('stopped')
      const spin = Number(options.spin ?? config.lineSpin ?? 0)
      const power = Number(options.power ?? config.power ?? 74)
      const prediction = await api.predict({ ...options, spin, power })
      state.table = applyPrediction(state.table, prediction, { power })
      state.phase = 'OPPONENT_TURN'
      state.turn = 'opponent'
      state.result = prediction.pocket && prediction.target
        ? `pot:${prediction.target.id}:${prediction.pocket.id}`
        : 'miss'
      emit()
      log(`predict ${prediction.target?.id || 'none'} -> ${prediction.pocket?.id || 'none'} power=${power} spin=${spin}`)
      return prediction
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

      if (state.phase === 'OPPONENT_TURN') {
        state.phase = 'RESULT'
        state.result = `sim:pot:${state.queue.completed + 1}`
        state.queue.completed += 1
        state.queue.matched += 1
      } else if (state.phase === 'RESULT') {
        state.phase = 'COOLDOWN'
        state.result = null
      } else if (state.phase === 'COOLDOWN' || state.phase === 'FIND_MATCH') {
        state.phase = 'YOUR_TURN'
        state.turn = 'you'
        state.result = null
        state.queue.queued += 1
      }

      emit()
    }, 800)
  }

  function stopSimulation() {
    if (simTimer) { clearInterval(simTimer); simTimer = null }
  }

  function reset() {
    stopped = false
    state = {
      ...DEFAULT_STATE,
      queue: { ...DEFAULT_STATE.queue },
      table: createDefaultTable(),
      lastPrediction: null
    }
    emit()
  }

  return { api, log, getState: api.getState, setState: api.setState, getTable: () => cloneTable(state.table || createDefaultTable()), subscribe: api.subscribe, startSimulation, stopSimulation, reset, getConfig: api.getConfig, setConfig: api.setConfig }
}
