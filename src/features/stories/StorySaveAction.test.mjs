import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function harness(onSave) {
  const hooks = [];
  const busyStates = [];
  let cursor = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], (value) => { hooks[index] = value; }];
    },
    useRef(initial) {
      const index = cursor++;
      return hooks[index] ??= { current: initial };
    },
    useEffect() {},
  };
  const modules = {
    react,
    "react-native": { ActivityIndicator: "Spinner", Pressable: "Button", Text: "Text", View: "View" },
    "@expo/vector-icons/Ionicons": "Icon",
    "./Stories.styles": { styles: {} },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("./StorySaveAction.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name) => modules[name], exports);
  return {
    busyStates,
    render() { cursor = 0; return exports.StorySaveAction({ onSave, onBusyChange: (busy) => busyStates.push(busy) }); },
  };
}

function find(tree, type) {
  if (tree?.type === type) return tree;
  for (const child of tree?.children ?? []) {
    const found = find(child, type);
    if (found) return found;
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("saving is inline, pauses the story, and prevents rapid duplicate writes", async () => {
  let complete;
  let calls = 0;
  const app = harness(() => { calls++; return new Promise((resolve) => { complete = resolve; }); });
  const button = find(app.render(), "Button");
  button.props.onPress();
  button.props.onPress();
  assert.equal(calls, 1);
  assert.equal(find(app.render(), "Button").props.disabled, true);
  assert.ok(find(app.render(), "Spinner"));
  assert.deepEqual(app.busyStates, [true]);
  complete(true);
  await flush();
  assert.equal(find(app.render(), "Button").props.accessibilityLabel, "Story saved to Gallery");
  assert.equal(find(app.render(), "Button").props.disabled, true);
  assert.deepEqual(app.busyStates, [true, false]);
});

for (const throws of [false, true]) {
  test(`save ${throws ? "rejection" : "failure"} shows retry instead of success`, async () => {
    const app = harness(async () => {
      if (throws) throw new Error("Save failed");
      return false;
    });
    find(app.render(), "Button").props.onPress();
    await flush();
    const button = find(app.render(), "Button");
    assert.equal(button.props.accessibilityLabel, "Retry saving story");
    assert.equal(button.props.disabled, false);
    assert.deepEqual(app.busyStates, [true, false]);
  });
}
