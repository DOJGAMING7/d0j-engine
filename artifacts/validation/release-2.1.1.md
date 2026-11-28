# D0J EnGine 2.1.1 validation

- Structural build check: **PASS**
- Live 8BP readiness: **NOT READY**

## Checks
- PASS package: package 2.1.1 = gradle 2.1.1 (code 7)
- PASS scripts: 2 scripts byte-identical in 4 locations
- PASS webAssets: 9 built files copied to native assets
- PASS java: 47 Java sources balanced, no accessibility declarations
- PASS manifest: daemon, 4 child processes, mem/input providers, overlay declared
- PASS bindings: honest UNMEASURED for com.miniclip.eightballpool 56.34.0 (code 4064)
- PASS versionMatrix: 3 version profiles; hook stub until device attach

## Limits
- Live 8BP offsets are UNMEASURED — live lines/autoplay cannot be trusted yet.
- Framework hook is a stub until attach succeeds on a device.
- No APK compilation or device verification is possible on this bench (no JDK/SDK/device).

## Device checklist
1. Install the unsigned debug APK on a real Android device (no root required).
2. Grant overlay and notification permission from inside the active session only.
3. Start session and confirm 8BP launches into a hosted :p0..:p3 process.
4. VM status must report HOOK_ATTACHED, not STUB_ONLY.
5. Capture state with probe/diff and save measured bindings for com.miniclip.eightballpool 56.34.0 (code 4064) only.
6. Bindings status must become MEASURED before trusting any live line.
7. Calibrate table rect on screen; verify cue/target/ghost/pocket lines align.
8. Bind a hosted activity; verify inputStatus INPUT_READY before autoplay.
9. Fire one manual shot, then one auto shot; confirm sent counter increments.
10. Exit the game and confirm the overlay/line layer closes within 8 seconds.
11. Repeat for every target build; do not reuse offsets across versions.
