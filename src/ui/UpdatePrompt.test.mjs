import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function harness(overrides = {}) {
  const hooks = [];
  let cursor = 0;
  let dismissed = 0;
  let downloaded = 0;
  let installed = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useEffect() {},
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], (value) => { hooks[index] = typeof value === "function" ? value(hooks[index]) : value; }];
    },
  };
  const updates = {
    manifest: { versionName: "0.1.1-dev.20261024.093510", versionCode: 2, apkBytes: 14_400_000, notes: "Release notes\n- Video timeline\n- Gallery fixes" },
    promptVisible: true,
    dismissible: true,
    forced: false,
    download: { stage: "idle" },
    installed: { versionName: "0.1.1" },
    canInstall: true,
    dismiss: () => { dismissed++; },
    startDownload: async () => { downloaded++; },
    install: async () => { installed++; },
    ...overrides,
  };
  const modules = {
    react,
    "react-native": { Modal: "Modal", Pressable: "Button", ScrollView: "ScrollView", View: "View", Text: "Text", ActivityIndicator: "Spinner", StyleSheet: { create: (s) => s }, BackHandler: { addEventListener: () => ({ remove() {} }) } },
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "@expo/vector-icons/Ionicons": "Icon",
    "../domain/updates": { formatBytes: () => "13.7 MiB" },
    "./theme": { palette: () => ({}), coral: "coral", onCoral: "white" },
    "./primitives": { tap() {} },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("./UpdatePrompt.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    assert.ok(name in modules, `Missing mock: ${name}`);
    return modules[name];
  }, exports);
  return {
    render(visible = true) { cursor = 0; return exports.default({ updates, dark: false, visible }); },
    get dismissed() { return dismissed; },
    get downloaded() { return downloaded; },
    get installed() { return installed; },
  };
}

function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...(tree.children ?? []).flat(Infinity).flatMap(nodes)];
}

function text(tree) {
  if (typeof tree === "string") return tree;
  return (tree?.children ?? []).flat(Infinity).map(text).join(" ");
}

function button(tree, label) {
  return nodes(tree).find((node) => node.type === "Button" && (node.props.accessibilityLabel === label || text(node).includes(label)));
}

test("update prompt is safe-area bounded with release notes expanded by default", () => {
  const tree = harness().render();
  assert.ok(nodes(tree).some((node) => node.type === "SafeAreaView"));
  assert.ok(nodes(tree).some((node) => node.type === "ScrollView"));
  assert.ok(text(tree).includes("Video timeline"));
  assert.ok(text(tree).includes("0.1.1-dev.20261024.093510"));
  assert.equal(button(tree, "What's new").props.accessibilityState.expanded, true);
});

test("release notes expand and collapse without hiding download or dismiss", () => {
  const app = harness();
  button(app.render(), "What's new").props.onPress();
  assert.equal(text(app.render()).includes("Video timeline"), false);
  assert.equal(button(app.render(), "What's new").props.accessibilityState.expanded, false);
  button(app.render(), "What's new").props.onPress();
  assert.ok(text(app.render()).includes("Video timeline"));
  assert.equal(button(app.render(), "What's new").props.accessibilityState.expanded, true);
  button(app.render(), "Download").props.onPress();
  button(app.render(), "Later").props.onPress();
  assert.equal(app.downloaded, 1);
  assert.equal(app.dismissed, 1);
});

test("forced update cannot be dismissed with back or a Later button", () => {
  const app = harness({ forced: true, dismissible: false });
  const tree = app.render();
  assert.equal(button(tree, "Later"), undefined);
  nodes(tree).find((node) => node.type === "Modal").props.onRequestClose();
  assert.equal(app.dismissed, 0);
});

test("a verified download still launches installation", () => {
  const app = harness({ download: { stage: "ready" } });
  button(app.render(), "Install update").props.onPress();
  assert.equal(app.installed, 1);
});

test("prompt stays hidden when another screen owns the foreground", () => {
  assert.equal(harness().render(false), null);
});
