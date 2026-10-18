# Messenger

A minimal Expo SDK 57 and React Native 0.86 TypeScript app. Android is built locally as a standalone ARM64 APK. There is no Expo Go, development client, or running Metro server in the phone-testing workflow.

Expo uses Metro internally to bundle JavaScript during the release build. Avoiding Metro entirely would mean replacing Expo's supported bundling pipeline. The APK contains the bundle and runs without a connection to this computer.

## Build and install

From this directory on Windows:

```sh
npm ci
npm run check
npm run android:build
```

The build generates `android/` if necessary, builds the release variant for `arm64-v8a`, and copies the APK to `artifacts/messenger-local.apk`. First builds can take several minutes. Build again after editing the app; there is no hot reload.

Connect an ARM64 Android phone running Android 7.0 or newer. Enable developer options and USB debugging, accept the phone's authorization prompt, then run:

```sh
npm run android:install
```

This installs and opens `com.yashraj.messenger`. ADB does not need to be on PATH. Use the `ANDROID_SERIAL` environment variable if more than one device is connected. You can also copy the APK to the phone and install it manually.

## This machine

The build script respects `ANDROID_HOME` or `ANDROID_SDK_ROOT` and `JAVA_HOME`. When unset, it uses the tool locations found on this machine:

| Tool | Location or version |
| --- | --- |
| Android SDK | `P:\Applications\Android\Sdk` |
| JDK | `P:\Applications\jdk-17.0.17+10` |
| SDK platform / target | Android 36 |
| Build Tools | 36.0.0 |
| NDK | 27.1.12297006 |
| CMake | 3.22.1 |

The Windows host is ARM64. The installed NDK uses Windows x86-64 host tools under Windows emulation. The APK's `arm64-v8a` ABI describes the Android phone, not the Windows toolchain.

The setup was compared with `../sosroad-rn`, `../famloc`, `../sosroad`, and `../cometchat-sample-app`. CometChat's recorded successful builds use `assembleRelease -PreactNativeArchitectures=arm64-v8a`. No custom AAPT2 override was found or added. Two Gradle workers limit concurrent native compilation.

SDK 57 matches those projects and the installed Android platform. The SDK 58 template requires platform 37, which was not installed when this project was created. Keep Expo and React Native versions aligned when upgrading.

`android/`, machine-specific `local.properties`, and build outputs are ignored by Git. Expo config is in `app.json`; regenerate native configuration with `npm run android:prebuild` after changing it. Do not put permanent manual changes in generated native files. Use an Expo config plugin for future native adjustments.

## Signing

This is a **local test build**, not a store release. Expo's generated release variant uses its debug signing key. Do not distribute this APK as a production release. Set up a private upload key and production signing before publishing. Regenerating the Android directory can change the test signing key; if Android reports a signature mismatch, uninstall the previous test app first, which deletes its app data.

## Checks and limitations

- `npm run check` passed TypeScript and Expo dependency compatibility checks during setup.
- `npm run android:build` completed successfully. Initial compilation exceeded the command time limit; cached follow-up builds completed the release tasks.
- APK inspection confirmed an embedded `assets/index.android.bundle` and 14 native libraries, all under `lib/arm64-v8a/`. The initial APK is about 26 MB.
- No phone was connected during initial setup, so installation and offline cold startup need a phone test.
- npm audit reports inherited Expo/React Native tooling advisories. Do not run `npm audit fix --force`: its proposed Expo/React Native downgrades are incompatible with this project. Recheck compatible upstream releases before production work.
- These build/install helpers target Windows and physical ARM64 Android phones. An x86-64 Android emulator needs its own ABI build. iOS native builds require macOS and Xcode.

`INSPIRATION/` is preserved for later design work. The basic starter screen is in `App.tsx`.
