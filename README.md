# D0J EnGine v2

Private, single-user Android client styled after the Snake Engine shell/layout language, rebuilt with a bright green and black theme. No seller panel, no licence server, no device binding, no premium gates, no orders and no payments.

## What is included

- `HOME MENU` launcher with `SUPPORTED GAMES`: `8 BALL POOL`, `CARROM POOL`, `SOCCER STARS`.
- Redirect to `com.miniclip.eightballpool` (`8 Ball Pool 56.34.0`) from the game card, `START`, or Settings.
- Bright green/black portrait mod menu rebuilt from the reference screenshot labels:
  - `BASIC SETTINGS`: `Show lines`, `Keep lines after shot`, `Power lock`
  - `OTHER SETTINGS`: `Default power`, `Show pockets`
  - `AUTO PLAY SETTINGS`: `Enable auto play`, `Auto play mode`, `Failed break`
  - `8 BALL PLAY SETTINGS`: `Prioritize 9th ball`, `Paralysis opponent turn`, `Clean up shot`
  - `GOLDEN SHOT SETTINGS`: `Golden shot target` 1–4
  - `D0J AUTO QUEUE`: `ONE` / `SESSION` / `INFINITE`, delay, jitter, retries, counters
  - `TABLE / STATE`: table profile, phase, turn, result, power, aimError
  - `DISPLAY OVER GAME`: permission, draggable floating button, accessibility settings
- Draggable floating `D0J` button using Android `SYSTEM_ALERT_WINDOW`. Tap opens a native green/black mod menu over 8BP; drag the header or button to move it. Position is saved locally.
- Optional `D0J Purchase Guard` accessibility service. It watches only the 8 Ball Pool package for coin/store/purchase screens and presses system `BACK`. It does not buy, pay, patch packets or modify the game.
- Local APK PASS unlock with a salted SHA-256 hash. No plaintext key is stored in the client.
- Ratimoda v2.1 state-machine autoplay test on the simulated bridge.
- `prediction-lines.js` 3-shot prediction test and a playable line-prediction demo table.
- GitHub OTA UI bundle updates, SHA-256 verification, rollback and update history.
- No server. All features run inside the APK.

## Honest scope

This is a local launcher, overlay and simulator. It does **not** attach to 8 Ball Pool memory, hook game functions, patch the APK, modify packets or spoof server responses. Real 8BP control would require a validated bridge and measured offsets/RVAs on `56.34.0`.

## Build

GitHub Actions builds the APK on every push to `main`.

Artifact: `D0J-ENGINE-V1.apk`

Local web build:

```bash
npm install
npm test
npm run build
npx cap sync android
```

## OTA UI updates

Settings → `GitHub raw / Pages URL` defaults to:

```text
https://raw.githubusercontent.com/DOJGAMING7/d0j-engine/main/updates
```

The app downloads `ui-manifest.json`, verifies `sha256`, downloads `ui-bundle.zip`, caches it and reloads into the cached UI. Rollback restores the built-in assets.

## Scripts

Current scripts:

- `autoplay-ratimoda.js` v2.1.0 — waits for `YOUR_TURN`, takes 3 correction-aimed shots, handles `OPPONENT_TURN`/`RESULT`, retries timeouts, requeues then stops cleanly. Accepts `Pro Fast`, `Pro Player` and `Fast Mode`.
- `prediction-lines.js` v1.0.0 — 3-shot prediction guide test (`cuePath`, ghost ball, target line, pocket pick).

Runner API:

```text
getState(), getConfig(), setConfig(patch), setState(patch),
subscribe(fn), waitFor(predicate, timeout), tap(x,y,delay),
swipe(x1,y1,x2,y2,duration), predict(options), shoot(options),
sleep(ms), stopAll()
```

Scripts are executed with `window`, `document`, `fetch` and `XMLHttpRequest` shadowed to `undefined`.

## Colour system

| Role | Hex |
|---|---|
| Background | `#050705` |
| Panel | `#080D08` |
| Section header | `#102010` |
| Row | `#0D160D` |
| Active row | `#173017` |
| Border | `#1F4A1F` |
| Bright green | `#39FF14` |
| Secondary green | `#00E676` |
| Light green | `#B6FF9E` |
| Normal text | `#F5FFF5` |
| Muted text | `#A8BBA8` |
| Warning | `#FFD400` |
| Danger | `#FF4D4D` |
