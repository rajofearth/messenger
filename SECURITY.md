# Security policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.0.1   | Yes       |

Only the latest release is supported. Older builds, locally built APKs and
anything running in Expo Go are not supported.

## Reporting a vulnerability

Use GitHub's private reporting: open the repository's **Security** tab and
choose **Report a vulnerability**. Do not open a public issue for a security
problem.

Include as much of the following as you can:

- what the issue is and why it matters;
- steps to reproduce it, ideally from a fresh install;
- the app version (release tag or commit), your Android version and device
  model;
- whether you installed a release APK or built the app yourself;
- relevant `adb logcat` output.

This is a small, volunteer-run prototype, so there is no formal response
deadline. Reports will be acknowledged as soon as possible.

## Scope

Messenger is a local prototype. It has no backend, no accounts, no push
notifications and no network messaging, and it stores its state unencrypted on
the device. Most findings that would matter for a hosted app do not apply here.
The parts worth attention are:

- **System notifications** (`modules/system-notifications/`): PendingIntent
  construction, notification actions (quick reply, read, mute, answer, decline,
  hang up, speaker), payload validation, and the app-private storage of pending
  actions and message snapshots.
- **Keyboard media** (`modules/keyboard-media/`): handling of the `content://`
  URIs a keyboard sends. Accepted files are capped at 25 MiB and copied into
  app-owned storage, so anything that bypasses that cap, the MIME checks or the
  cleanup, or that writes outside the intended storage location, is interesting.
- **Release workflow**: `.github/workflows/release.yml` and the signing secrets
  it consumes. Never paste real secrets or keystores into an issue.

The unencrypted local storage, the simulated nature of the calls and messages,
and the generated debug signing key used by local builds and by releases without
signing secrets are documented limitations of the prototype, not
vulnerabilities. See `README.md` for the full list.

## Out of scope

- Vulnerabilities in Expo, React Native or other upstream packages. Report those
  to the upstream project. This repository inherits npm audit advisories from
  its build tooling, and a bare advisory with no demonstrated effect on this app
  is not a finding.
- Anything that requires a rooted device with an unlocked bootloader, unless it
  demonstrates a concrete attack path that does not depend on root.
- Issues that only affect mock data, developer machines or a test environment.

Please test only against your own device and your own installation. Do not
attempt to access anyone else's device or data.
