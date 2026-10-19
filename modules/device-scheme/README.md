# Device scheme

Android-only local Expo module. Public TypeScript entry point is `src/services/deviceScheme.ts`. Rebuild the native app after changing it. Expo's default local `modules/` discovery registers it; no manifest entry or permission is needed. Not supported in Expo Go, iOS, or web, where the bridge returns the React Native fallback instead.

The module answers one question: which scheme is the *device* in right now, and when does that change. React Native cannot answer it for this app. `Appearance` reads the activity's configuration, and an app that sets a night mode - `userInterfaceStyle: "automatic"` does it through `expo-system-ui` - gives AppCompat a configuration to remember: Android re-applies it on every later configuration change (`ConfigurationController.performConfigurationChanged`), so the activity keeps the scheme the device had when it was created. `AppearanceModule` compares against that frozen value, sees no change, and emits nothing, which is why a device theme switch used to reach the app only after a restart.

The application context never receives that configuration, and its resources are updated in place, so it is the one place in the process that knows the device's real scheme. `MainApplication` already forwards the same event to Expo's lifecycle listeners; this module registers its own `ComponentCallbacks` so it does not depend on that wiring.

## Parent API contract

| Function | Contract |
| --- | --- |
| `getDeviceScheme()` | The device scheme now, `"light"` or `"dark"`. Synchronous, because `src/state/useDeviceScheme.ts` wants it before the first render. Returns `null` from the bridge when the module is unavailable. |
| `subscribeToDeviceScheme(listener)` | Calls back with `"light"` or `"dark"` on every device change, from `onDeviceSchemeChanged`. Returns `{ remove() }`. |

The module reports the device only. It never sets a scheme, never touches the activity, and never decides whether the app *should* follow the device: `resolveDark` in `src/ui/theme.ts` owns that, and `src/ui/useSystemAppearance.ts` still tells AppCompat which theme native surfaces should use.

`onConfigurationChanged` arrives for every configuration change, not just the scheme: a configuration whose `uiMode` night bit is unchanged still emits an event with the same scheme, and the hook drops the repeat. That keeps the native side free of comparison state, which would otherwise need to survive a listener that is registered once per React context.

One caveat, for API 24–27 only: Expo maps `userInterfaceStyle: "automatic"` to AppCompat's battery-saver night mode there, because those releases have no system dark theme. A saved battery can then darken native surfaces while this module keeps reporting "light", and the JavaScript palette stays light with them. API 28 and later follow the system, which is what the module reports.

## Validation

The v0.0.5 arm64-v8a release build compiled the module, Expo autolinking listed `device-scheme` and `expo.modules.devicescheme.DeviceSchemeModule`, the bundled JavaScript carried the bridge and the hook, and `npm run release:check` passed on the APK. None of that exercises the live event: the build host has no arm64 emulator, so the checklist below is what a phone has to confirm.

Focused loops while iterating: `gradlew.bat :device-scheme:compileReleaseKotlin --console=plain --max-workers=2` from `android/`, after `npm run android:prebuild`, for the Kotlin side; `npm run typecheck` and `npm test` for the JavaScript side.

Device acceptance checklist:

1. Settings → Display → Dark theme, with the app in Settings on the system theme and in the foreground: the app's palette switches while it runs, without a restart and without leaving the app.
2. Pick a pinned theme, then switch the device theme: the palette must not move.
3. Switch back to the system theme with the device in the other scheme: the palette follows immediately.
4. Change the device theme from quick settings, with the app in the background, then return to it: the palette is correct on resume.
