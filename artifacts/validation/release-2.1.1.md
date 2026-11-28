# D0J EnGine 2.1.1 validation

- Structural build check: **PASS**
- Live 8BP readiness: **NOT READY**

## Checks
- PASS package: package 2.1.1 = gradle 2.1.1 (code 7)
- PASS scripts: 2 scripts byte-identical in 4 locations
- PASS webAssets: 9 built files copied to native assets
- PASS java: 47 Java sources balanced, in-window HUD, no overlay/capture/VPN/accessibility
- PASS manifest: daemon, 4 child processes, mem/input providers, notification-only session declared
- PASS offline: 2 scripts bundled byte-identical; local-only runner; no key gate; no overlay/capture/VPN
- PASS bindings: honest UNMEASURED for com.miniclip.eightballpool 56.34.0 (code 4064)
- PASS versionMatrix: 3 version profiles; hook stub until device attach

## Limits
- Live 8BP offsets are UNMEASURED — live lines/autoplay cannot be trusted yet.
- Framework hook is a stub until attach succeeds on a device.
- No APK compilation or device verification is possible on this bench (no JDK/SDK/device).

## Device checklist
1. Install the signed APK over v24+ using the stable key (no root required).
2. Grant notification permission; confirm no Display-over-other-apps or VPN prompt appears.
3. Start session and confirm the installed Play Store 8BP opens through this client.
4. Confirm the floating icon and menu appear only inside the hosted game window.
5. VM status must report HOOK_ATTACHED, not STUB_ONLY.
6. Capture state with probe/diff and save measured bindings for com.miniclip.eightballpool 56.34.0 (code 4064) only.
7. Bindings status must become MEASURED before trusting any live line.
8. Calibrate table rect on screen; verify cue/target/ghost/pocket lines align.
9. Bind a hosted activity; verify inputStatus INPUT_READY before autoplay.
10. Fire one manual shot, then one auto shot; confirm sent counter increments.
11. Exit the game and confirm the in-window controls and lines close within 8 seconds.
12. Repeat for every target build; do not reuse offsets across versions.
