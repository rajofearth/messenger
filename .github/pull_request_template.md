# Pull request

## What changed and why

<!-- A short summary. Link the issue this closes, if there is one. -->

## Checks

- [ ] `npm run check` passes (typecheck and Expo dependency check)
- [ ] `npm test` passes
- [ ] New test files are registered in the `test` script in `package.json`

## Device testing

State whether this was tested on a physical Android device. If it was, note the
device model, Android version and whether the APK was a release build or a local
build. If it was not tested on a device, say so. The local modules
(`modules/system-notifications`, `modules/keyboard-media`) need a rebuilt
Android binary and do not work in Expo Go.

## Checklist

- [ ] Screenshots or a recording are attached for visual changes
- [ ] A native rebuild is needed (local module, `app.json` plugin or permission change), or the change is JavaScript-only
- [ ] Documentation is updated, or no documentation change is needed
