import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function load(relativePath, modules, append = "") {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8") + append;
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    assert.ok(name in modules, `Missing mock: ${name}`);
    return modules[name];
  }, exports);
  return exports;
}

function harness(initialStates = []) {
  const effects = [];
  const events = [];
  const states = [...initialStates];
  let cursor = 0;
  let released = false;
  let releaseCount = 0;
  let playing = false;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (value) => { states[index] = value; }];
    },
    useRef: (value) => ({ current: value }),
    useMemo: (factory) => factory(),
    useEffect: (effect) => { effects.push(effect); },
  };
  const player = {
    play() { assert.equal(released, false, "play called after native player release"); playing = true; },
    pause() { assert.equal(released, false, "pause called after native player release"); playing = false; },
    release() { released = true; playing = false; releaseCount++; },
    addListener: () => ({ remove() {} }),
    replace() {},
    replaceAsync() {},
  };
  // Execute Expo's installed lifecycle code, not an invented cleanup order.
  const lifecycle = load("../../../node_modules/expo-modules-core/src/hooks/useReleasingSharedObjectWithLifecycle.ts", { react });
  const shared = load("../../../node_modules/expo-modules-core/src/hooks/useReleasingSharedObject.ts", {
    "./useReleasingSharedObjectWithLifecycle": lifecycle,
  });
  const video = load("../../../node_modules/expo-video/src/VideoPlayer.tsx", {
    "expo-modules-core": shared,
    "./NativeVideoModule": { VideoPlayer: function () { return player; } },
    "./resolveAssetSource": () => ({}),
  });
  const preview = load("./MediaPickerPreview.tsx", {
    react,
    "react-native": { View: "View", Text: "Text", Pressable: "Pressable", Platform: { OS: "android" } },
    "expo-image": { Image: "Image" },
    "expo-video": { ...video, VideoView: "VideoView" },
     "expo-media-library": { MediaType: { VIDEO: "video", IMAGE: "image" }, Asset: function () { return { getUri: async () => "content://media/video.mp4" }; } },
    "expo-navigation-bar": { NavigationBar: "NavigationBar" },
    "expo-status-bar": { StatusBar: "StatusBar" },
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "@expo/vector-icons/Ionicons": "Icon",
    "../../ui/theme": {},
    "../../ui/primitives": {},
    "../../services/mediaThumbnails": { getMediaThumbnail: async () => "file:///thumbnail.jpg" },
    "../../services/devTelemetry": { trackDevEvent: (event, fields) => events.push({ event, ...fields }) },
    "./MediaPicker.styles": { styles: {} },
  }, "\nexport { PreviewVideo, PreviewPage };\n");
  return {
    player,
    events,
    video: () => preview.PreviewVideo({ uri: "content://media/external/video/media/1" }),
    page: (active, mediaType = "video") => preview.PreviewPage({
      asset: { id: "content://media/external/video/media/1", mediaType },
      active, width: 360, selected: false, onToggle() {}, colors: {},
    }),
    unmount() {
      const cleanups = effects.map((effect) => effect());
      for (const cleanup of cleanups) cleanup?.();
    },
    get playing() { return playing; },
    get releaseCount() { return releaseCount; },
  };
}

function find(tree, type) {
  if (tree?.type === type) return tree;
  for (const child of tree?.children ?? []) {
    const found = find(child, type);
    if (found) return found;
  }
}

test("swiping away or closing releases autoplay video once without touching a released player", () => {
  const app = harness();
  app.video();
  assert.equal(app.playing, true);
  assert.equal(app.player.muted, false);
  assert.doesNotThrow(() => app.unmount());
  assert.equal(app.releaseCount, 1);
  assert.equal(app.playing, false);
});

test("preview enables native duration and draggable timeline inside the bounded media stage", () => {
  const app = harness();
  const view = find(app.video(), "VideoView");
  assert.equal(view.props.nativeControls, true);
  assert.equal(view.props.requiresLinearPlayback, false);
  assert.equal(view.props.buttonOptions.showBottomBar, true);
  assert.equal(view.props.fullscreenOptions.enable, false);
});

test("inactive video pages use the cached poster, never a video URI in the image decoder", () => {
  const app = harness(["file:///thumbnail.jpg", null]);
  const image = find(app.page(false), "Image");
  assert.equal(image.props.source.uri, "file:///thumbnail.jpg");
});

test("video timing records the first rendered frame once, not a thumbnail resolution", () => {
  const app = harness();
  const view = find(app.video(), "VideoView");
  view.props.onFirstFrameRender();
  view.props.onFirstFrameRender();
  assert.equal(app.events.length, 1);
  assert.equal(app.events[0].event, "media_preview_video_first_frame");
  assert.equal(app.events[0].video, true);
  assert.ok(app.events[0].durationMs >= 0);
});
