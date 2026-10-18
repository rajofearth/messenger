import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const action = process.argv[2];
if (!['build', 'install'].includes(action)) {
  throw new Error('Usage: node scripts/android.mjs build|install');
}
if (process.platform !== 'win32') {
  throw new Error('These local Android commands are configured for Windows. See README.md.');
}

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || 'P:/Applications/Android/Sdk';
const java = process.env.JAVA_HOME || 'P:/Applications/jdk-17.0.17+10';
const env = {
  ...process.env,
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
  JAVA_HOME: java,
  NODE_ENV: 'production',
};
const apk = path.join(root, 'artifacts', 'messenger-local.apk');

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

if (action === 'install') {
  const adb = path.join(sdk, 'platform-tools', 'adb.exe');
  if (!existsSync(adb)) throw new Error(`ADB not found at ${adb}. Set ANDROID_HOME.`);
  if (!existsSync(apk)) throw new Error('Build the APK first with npm run android:build.');
  // ANDROID_SERIAL can select a phone when multiple devices are connected.
  run(adb, ['install', '-r', apk]);
  run(adb, ['shell', 'am', 'start', '-n', 'com.yashraj.messenger/.MainActivity']);
} else {
  for (const required of [
    path.join(java, 'bin', 'java.exe'),
    path.join(sdk, 'platforms', 'android-36', 'android.jar'),
    path.join(sdk, 'build-tools', '36.0.0', 'aapt2.exe'),
    path.join(sdk, 'ndk', '27.1.12297006', 'source.properties'),
  ]) {
    if (!existsSync(required)) throw new Error(`Missing Android build prerequisite: ${required}`);
  }
  if (!existsSync(path.join(root, 'android', 'gradlew.bat'))) {
    run(process.execPath, ['node_modules/expo/bin/cli', 'prebuild', '--platform', 'android', '--no-install']);
  }
  const android = path.join(root, 'android');
  writeFileSync(path.join(android, 'local.properties'), `sdk.dir=${sdk.replaceAll('\\', '/').replaceAll(':', '\\:')}\n`);
  run('cmd.exe', ['/d', '/s', '/c', 'gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --console=plain --max-workers=2'], android);
  mkdirSync(path.dirname(apk), { recursive: true });
  copyFileSync(path.join(android, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'), apk);
  console.log(`\nStandalone test APK: ${apk}`);
  console.log('This APK uses the generated debug signing key. Do not publish it to a store.');
}
