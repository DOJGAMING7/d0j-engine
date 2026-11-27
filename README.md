# D0J EnGine

Private, single-user Android client styled after the Snake Engine launcher shell. No seller panel, no keys, no subscription, no device binding, no premium gates.

## Current scope

- Portrait Capacitor Android shell with navy/teal visual system.
- Home screen with original D0J wordmark and status card.
- In-app mod menu: `AUTO PLAY`, `AUTO QUEUE`, `AIM`, `CONTROLS`, `TABLE`.
- Settings with GitHub URL OTA UI bundle updates, rollback, update history, and script runner log.
- Ratimoda autoplay test script running on a **simulated bridge**.
- All build-dependent offsets/RVAs are deliberately `UNSET` until measured on 8 Ball Pool 56.34.0.

> This build does not attach to a game process yet. The bridge is a deterministic simulator used to validate UI, menu state, and script flow.

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

Settings → `GitHub raw / Pages URL` should point to the `updates/` directory:

```text
https://raw.githubusercontent.com/DOJGAMING7/d0j-engine/main/updates
```

The app downloads `ui-manifest.json`, verifies `sha256`, downloads `ui-bundle.zip`, caches it, and reloads into the cached UI. UI changes do not require a new APK.

## Scripts

Scripts live in `public/scripts/` and are copied into the OTA bundle.

Current script:

- `autoplay-ratimoda.js` — 3-shot autoplay test using `waitFor`, `getState`, `tap`, `setConfig`, and `sleep`.

Runner API:

```text
getState(), getConfig(), setConfig(patch), setState(patch),
subscribe(fn), waitFor(predicate, timeout), tap(x,y,delay),
swipe(x1,y1,x2,y2,duration), sleep(ms), stopAll()
```

Scripts are executed with `window`, `document`, `fetch`, and `XMLHttpRequest` shadowed to `undefined`.

## Colour system

| Role | Hex |
|---|---|
| Brand navy | `#00102A` |
| Shell | `#04162E` |
| Panel | `#0A2440` |
| Primary accent | `#00E6A6` |
| Secondary accent | `#00C8FF` |
| Text | `#EAF6FF` |
| Muted | `#8AA8BF` |
| Success / warning / danger | `#3DDC84` / `#FFD166` / `#FF5A5A` |
