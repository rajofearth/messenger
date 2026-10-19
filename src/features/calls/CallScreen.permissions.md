# Camera integration handoff

`CallScreenCamera.tsx` uses `expo-camera` for a live local preview. The front camera is selected by default. The user taps Enable camera to request permission. A permanent denial offers Open settings. Returning from settings refreshes permission. Turning video off or leaving the screen unmounts the preview; backgrounding also releases it. Camera mount errors offer Retry camera.

This does not implement call transport, record video, or capture microphone audio. The remote image and audio controls remain simulated. `App.tsx` and the call state hook were not changed.

## Native setup

The compatible `expo-camera` dependency and lockfile are installed, and `CallScreenCamera.tsx` is its only consumer. On Android the camera permission comes from the module's own manifest (`android.permission.CAMERA`), so no `expo-camera` entry in `expo.plugins` is needed; microphone permission for voice notes is configured separately through the audio plugin.

Barcode scanning is disabled at build time because the app never scans a barcode and the scanner accounts for roughly 6 MB of the APK:

- `package.json` lists `expo-camera` under `expo.autolinking.android.buildFromSource`, so Gradle builds the module from `node_modules` instead of using the prebuilt AAR whose POM depends on MLKit at runtime.
- `plugins/withBarcodeScannerDisabled.js` writes `expo.camera.barcode-scanner-enabled=false` into `android/gradle.properties`, which makes the module compile its MLKit dependencies as `compileOnly`.
- `app.json`'s `extraProguardRules` adds `-dontwarn` rules for the resulting missing classes; the barcode paths stay unreachable because the module's own availability check fails at runtime.

The live preview, capture and recording are unaffected. `docs/PERFORMANCE.md` records the measured effect.

Run the project's native prebuild/build workflow and install the new APK. `npm run android:build` only regenerates the native project when `android/` is missing, so run `npm run android:prebuild` first after changing `app.json` or the plugins. Installing the JavaScript dependency alone does not add native modules to an existing app binary.

## Validation

`src/features/calls/CallScreenCamera.test.mjs` runs as part of `npm test`.

Device checks still required on Android and iOS:

- Enable camera, grant access, and confirm the live mirrored front preview.
- Switch cameras and turn video off/on.
- Deny access, permanently deny access, and restore permission through settings.
- Background/foreground the app, leave the call screen, and end the call. Confirm the OS camera indicator clears when the preview is not mounted.
- Confirm a device without an available camera shows a retry control instead of a stock portrait.
