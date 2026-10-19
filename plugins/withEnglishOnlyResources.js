const { withAppBuildGradle } = require("@expo/config-plugins");

// Every AndroidX, Material and Play Services library ships translated strings
// for around a hundred locales, and resource shrinking does not touch them
// because they are reachable from the merged resources. The app's own UI is
// English-only, so those translations can never be shown.
//
// `resConfigs "en"` tells AAPT2 to keep only English and the default
// configuration, which drops the other locales from res/ and
// resources.arsc. Non-locale qualifiers - density, night mode, screen size,
// layout direction - are untouched.
const RES_CONFIGS = 'resConfigs "en"';

module.exports = function withEnglishOnlyResources(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      throw new Error(
        "withEnglishOnlyResources expects the Groovy app/build.gradle",
      );
    }
    const { contents } = config.modResults;
    if (contents.includes(RES_CONFIGS)) return config;
    const defaultConfig = contents.match(/^[ \t]*defaultConfig\s*\{/m);
    if (!defaultConfig) {
      throw new Error(
        "withEnglishOnlyResources could not find defaultConfig in android/app/build.gradle",
      );
    }
    const insertAt = defaultConfig.index + defaultConfig[0].length;
    config.modResults.contents = `${contents.slice(0, insertAt)}\n        ${RES_CONFIGS}${contents.slice(insertAt)}`;
    return config;
  });
};
