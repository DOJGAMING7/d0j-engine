# D0J EnGine release validation (step 8)

## On this bench

```sh
npm run release:local
```

This runs the test suite, builds the web bundle, copies it into the native
assets with Capacitor, then runs `scripts/validate-release.mjs`.

The validator checks:

- package version matches `android/app/build.gradle`
- each shipped script is byte-identical in `scripts/`, `public/scripts/`,
  `dist/scripts/` and `android/app/src/main/assets/public/scripts/`
- every built web file matches the native asset copy (catches stale assets)
- Java sources are structurally balanced and contain no Accessibility code
- the manifest declares the daemon, four `:p0..:p3` processes, memory/input
  providers, overlay permission and notifications
- the 8BP binding file is honestly `UNMEASURED` until real offsets are saved
- supported-version matrix records which gates are still unverified

Reports are written to `artifacts/validation/release-<version>.json` and
`.md`. A structural failure exits non-zero.

## Device-only gates

This bench has no JDK, Android SDK or device. These cannot be proven here and
are reported as limits, never as passes:

1. Install the APK on a real Android device (root not required).
2. Request overlay and notification permission only during an active session.
3. Start a session, launch 8BP and confirm the hosted process (`:p0..:p3`).
4. VM status must say `HOOK_ATTACHED`; `STUB_ONLY` is not a pass.
5. Probe/diff memory and save offsets for **this exact build only**
   (`com.miniclip.eightballpool`, `56.34.0`, code `4064`).
   The binding file must switch from `UNMEASURED` to `MEASURED` with real values.
6. Calibrate the table rectangle on screen and visually confirm cue, target,
   ghost and pocket lines match the real table.
7. Attach input; `inputStatus` must say `INPUT_READY`.
8. Fire one manual shot, then one auto shot; confirm the sent counter moves.
9. Exit the game and confirm the overlay, menu and line layer close within 8s.
10. Repeat the measurement steps for every other target build. Never reuse
    offsets across versions.

## Honest rule

`ok: true` in the report means the **local build inputs are consistent**.
`liveReady: true` additionally requires measured bindings and an attached hook.
Until then the app must label its state `demo-simulated` / `UNMEASURED` and
must never claim live 8BP lines or autoplay are verified.
