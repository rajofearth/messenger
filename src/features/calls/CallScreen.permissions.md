# Camera integration handoff

`CallScreenCamera.tsx` uses `expo-camera` for a live local preview. The front camera is selected by default. The user taps Enable camera to request permission. A permanent denial offers Open settings. Returning from settings refreshes permission. Turning video off or leaving the screen unmounts the preview; backgrounding also releases it. Camera mount errors offer Retry camera.

This does not implement call transport, record video, or capture microphone audio. The remote image and audio controls remain simulated. `App.tsx` and the call state hook were not changed.

## Parent setup required

The compatible `expo-camera` dependency and lockfile are installed. Native configuration is outside this change's ownership, so the parent must add the following plugin entry to `expo.plugins` in `app.json`:

```json
[
  "expo-camera",
  {
    "cameraPermission": "Allow Messenger to show your local camera preview during video calls.",
    "recordAudioAndroid": false,
    "barcodeScannerEnabled": false
  }
]
```

Keep existing audio and image-picker permission configuration. `recordAudioAndroid: false` stops this plugin from adding recording permission; it does not remove microphone permission needed by voice notes or other plugins.

Run the project's native prebuild/build workflow and install a new development build. Installing the JavaScript dependency alone does not add the native camera module to an existing app binary. For manually maintained native projects, ensure Android declares `android.permission.CAMERA` and iOS defines `NSCameraUsageDescription`; prefer the Expo plugin to configure these.

## Validation

Run `node --test src/features/calls/CallScreenCamera.test.mjs` explicitly. The root test script was left unchanged because package edits are limited to dependencies.

Device checks still required on Android and iOS:

- Enable camera, grant access, and confirm the live mirrored front preview.
- Switch cameras and turn video off/on.
- Deny access, permanently deny access, and restore permission through settings.
- Background/foreground the app, leave the call screen, and end the call. Confirm the OS camera indicator clears when the preview is not mounted.
- Confirm a device without an available camera shows a retry control instead of a stock portrait.
