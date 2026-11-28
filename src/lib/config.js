export const TARGET_BUILD = '56.34.0'

export const GAME_PACKAGES = {
  eightBallPool: 'com.miniclip.eightballpool',
  carromPool: 'com.miniclip.carrom',
  soccerStars: 'com.miniclip.soccerstars'
}

export const SUPPORTED_GAMES = [
  { id: 'eightBallPool', name: '8 BALL POOL', packageName: GAME_PACKAGES.eightBallPool, badge: 'TARGET', note: '56.34.0 · main client' },
  { id: 'carromPool', name: 'CARROM POOL', packageName: GAME_PACKAGES.carromPool, badge: 'READY', note: 'launcher profile' },
  { id: 'soccerStars', name: 'SOCCER STARS', packageName: GAME_PACKAGES.soccerStars, badge: 'READY', note: 'launcher profile' }
]

export const AUTOPLAY_MODES = ['Pro Fast', 'Pro Player', 'Fast Mode']
export const QUEUE_MODES = ['ONE', 'SESSION', 'INFINITE']
export const GOLDEN_TARGETS = [1, 2, 3, 4]
export const TABLE_PROFILES = ['London', 'Moscow', 'Beijing', 'Barcelona']

export const DEFAULT_CONFIG = {
  autoPlay: false,
  autoPlayMode: 'Pro Fast',
  mode: 'Fast',
  // Auto queue is intentionally hidden/removed from client UI (3A).
  autoQueue: false,
  queueMode: 'ONE',
  matchLimit: 3,
  queueDelay: 2,
  jitter: 0.4,
  retries: 2,
  stopOnManual: true,
  queueTable: 'London',
  showLines: true,
  keepLines: true,
  powerLock: false,
  showPockets: true,
  failedBreak: false,
  prioritize9: false,
  paralysisOpponent: false,
  cleanUpShot: false,
  goldenTarget: 1,
  tableProfile: 'London',
  guideOpacity: 70,
  power: 74,
  lineSpin: 0,
  lineOpacity: 85,
  lineTestShoot: false,
  sideSpin: 0,
  topSpin: 0,
  // Session/UX
  sessionActive: false,
  notificationsEnabled: true,
  tempNotifications: true,
  runTestOnLaunch: true,
  blockLaunchOnFail: false,
  menuSide: 'left',
  menuX: 18,
  menuY: 18,
  autoStopOnGameExit: false
}

export function normalizeMode(value) {
  if (value === 'Pro Fast' || value === 'Fast Mode' || value === 'Fast') return 'Fast'
  if (value === 'Pro Player' || value === 'Human') return 'Human'
  if (value === 'Slow') return 'Slow'
  return 'Fast'
}
