import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function harness(permission, options = {}) {
  const states = [];
  let cursor = 0;
  let listener;
  let requested = 0;
  let settingsOpened = 0;
  const effects = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value) => { states[index] = value; }];
    },
    useEffect(effect) { effects.push(effect); },
  };
  const modules = {
    react,
    "react-native": {
      AppState: {
        currentState: "active",
        addEventListener: (_, callback) => {
          listener = callback;
          return { remove() {} };
        },
      },
      Linking: { openSettings: async () => { settingsOpened++; } },
      Pressable: "Pressable", Text: "Text", View: "View",
      StyleSheet: { absoluteFill: {} },
    },
    "expo-camera": {
      CameraView: "CameraView",
      useCameraPermissions: () => [permission, async () => {
        requested++;
        if (options.reject) throw new Error("Permission failed");
      }, async () => permission],
    },
    "./CallScreen.styles": { styles: { youText: {} } },
  };
  const source = readFileSync(new URL("./CallScreenCamera.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name) => modules[name], exports);
  return {
    render(front = true) { cursor = 0; return exports.default({ front }); },
    mount() { effects[0](); },
    background() { listener("background"); },
    get requested() { return requested; },
    get settingsOpened() { return settingsOpened; },
  };
}

function button(tree) {
  if (tree.type === "Pressable") return tree;
  for (const child of tree.children ?? []) {
    if (child && typeof child === "object") {
      const found = button(child);
      if (found) return found;
    }
  }
}

test("granted permission renders a mirrored front preview and supports rear camera", () => {
  const app = harness({ granted: true });
  assert.equal(app.render().type, "CameraView");
  assert.equal(app.render().props.facing, "front");
  assert.equal(app.render().props.mirror, true);
  assert.equal(app.render(false).props.facing, "back");
  assert.equal(app.render(false).props.mirror, false);
  assert.equal(app.render().props.mode, "picture");
  assert.equal(app.render().props.mute, true);
});

test("permission is requested only from the enable action", async () => {
  const app = harness({ granted: false, canAskAgain: true });
  const tree = app.render();
  assert.equal(app.requested, 0);
  assert.equal(button(tree).props.accessibilityLabel, "Enable camera");
  await button(tree).props.onPress();
  assert.equal(app.requested, 1);
});

test("permanent denial opens system settings instead of requesting again", async () => {
  const app = harness({ granted: false, canAskAgain: false });
  await button(app.render()).props.onPress();
  assert.equal(app.settingsOpened, 1);
  assert.equal(app.requested, 0);
});

test("backgrounding unmounts the camera", () => {
  const app = harness({ granted: true });
  app.render();
  app.mount();
  app.background();
  assert.notEqual(app.render().type, "CameraView");
});

test("mount failure exposes retry and remounts the camera", () => {
  const app = harness({ granted: true });
  app.render().props.onMountError();
  assert.equal(button(app.render()).props.accessibilityLabel, "Retry camera");
  button(app.render()).props.onPress();
  assert.equal(app.render().type, "CameraView");
});

test("permission request rejection stays recoverable", async () => {
  const app = harness({ granted: false, canAskAgain: true }, { reject: true });
  button(app.render()).props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(button(app.render()).props.disabled, false);
  assert.equal(button(app.render()).props.accessibilityLabel, "Enable camera");
});
