const { withGradleProperties } = require("@expo/config-plugins");

// expo-camera links MLKit's barcode scanner by default: a 4.9 MB native
// library, ~0.9 MB of bundled TensorFlow models and their Java classes. This
// app never scans a barcode, and expo-camera reads this property from its
// android/build.gradle to downgrade the MLKit dependencies to compileOnly.
// The camera preview, photo capture and video recording are unaffected, and
// the runtime check (CameraUtils.isMLKitBarcodeScannerAvailable) simply
// reports that barcode scanning is unavailable.
//
// Two things have to line up for that property to be read:
//
//   1. The property lives in android/gradle.properties, which is regenerated
//      by every prebuild, so it is set here rather than by hand.
//   2. Expo ships expo-camera as a prebuilt AAR in its local Maven repository,
//      and that AAR depends on MLKit at runtime. package.json therefore lists
//      expo-camera under expo.autolinking.android.buildFromSource, so Gradle
//      builds the module from node_modules and this property takes effect.
const CAMERA_BARCODE_PROPERTY = "expo.camera.barcode-scanner-enabled";

module.exports = function withBarcodeScannerDisabled(config) {
  return withGradleProperties(config, (config) => {
    config.modResults = config.modResults.filter(
      (item) => !(item.type === "property" && item.key === CAMERA_BARCODE_PROPERTY),
    );
    config.modResults.push({
      type: "property",
      key: CAMERA_BARCODE_PROPERTY,
      value: "false",
    });
    return config;
  });
};
