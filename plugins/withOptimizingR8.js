const { withAppBuildGradle, withDangerousMod } = require("@expo/config-plugins");
const { readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const FROM = 'getDefaultProguardFile("proguard-android.txt")';
const TO = 'getDefaultProguardFile("proguard-android-optimize.txt")';

/**
 * Turns on R8's optimiser for release builds.
 *
 * The Expo template ships `proguard-android.txt`, which contains
 * `-dontoptimize`. The optimised file keeps shrinking but also rewrites code:
 * inlining, class merging and dead-code removal. It is the only size lever
 * whose result cannot be known without a release build, so the phase is
 * measured on its own.
 *
 * Also removes the template's Reanimated keep rule. Reanimated is not a
 * dependency; leaving the rule in place hides a future missing-class failure
 * instead of preventing one.
 */
module.exports = function withOptimizingR8(config) {
  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      throw new Error("withOptimizingR8 expects a Groovy build.gradle");
    }
    // `expo prebuild` without --clean runs on an already-generated tree, so a
    // second run must accept the optimised file it wrote the first time.
    if (config.modResults.contents.includes(TO)) return config;
    if (!config.modResults.contents.includes(FROM)) {
      throw new Error(
        "withOptimizingR8: neither proguard-android.txt nor proguard-android-optimize.txt is in the generated build.gradle",
      );
    }
    config.modResults.contents = config.modResults.contents.replace(FROM, TO);
    return config;
  });

  return withDangerousMod(config, [
    "android",
    async (config) => {
      const file = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "proguard-rules.pro",
      );
      let contents;
      try {
        contents = await readFile(file, "utf8");
      } catch {
        return config;
      }
      const next = contents.replace(
        /\n# react-native-reanimated\n-keep class com\.swmansion\.reanimated\.\*\* \{ \*; \}\n/,
        "\n",
      );
      // Fail loudly if the template moves the rule instead of silently
      // keeping dead classes.
      if (next.includes("com.swmansion.reanimated")) {
        throw new Error(
          "withOptimizingR8: the Reanimated keep rule is still in proguard-rules.pro",
        );
      }
      if (next !== contents) await writeFile(file, next);
      return config;
    },
  ]);
};
