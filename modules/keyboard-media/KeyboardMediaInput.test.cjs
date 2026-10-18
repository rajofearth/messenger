const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../../src/ui/KeyboardMediaInput.tsx'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  },
}).outputText;

// Run the actual wrapper with minimal hook/native mocks, without a device or renderer.
function harness(platform, native = null) {
  const warnings = [];
  const effects = [];
  let id = 0;
  const react = {
    forwardRef: (render) => render,
    useEffect: (effect) => effects.push(effect),
    useId: () => `input-${++id}`,
    useRef: (current) => ({ current }),
    createElement: (type, props) => ({ type, props }),
  };
  const context = vm.createContext({
    exports: {},
    console: { warn: (message) => warnings.push(message) },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react-native') return {
        Platform: { OS: platform },
        TextInput: 'TextInput',
        findNodeHandle: () => 17,
      };
      if (name === 'expo-modules-core') return { requireOptionalNativeModule: () => native };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  function load() {
    context.exports = {};
    vm.runInContext('(function(exports, require) {\n' + compiled + '\n})(exports, require);', context);
    return context.exports;
  }
  function mount(api, props = {}, ref = { current: null }) {
    const input = api.KeyboardMediaInput({ onMedia() {}, ...props }, ref);
    const host = { focus() {}, blur() {} };
    input.props.ref(host);
    const cleanup = effects.shift()();
    return { input, host, ref, cleanup };
  }
  return { load, mount, warnings };
}

test('missing Android binary warns once across mounts and module reload, never calls onMediaError', () => {
  const h = harness('android');
  let errors = 0;
  let api = h.load();
  assert.equal(api.keyboardMediaAvailable, false);
  h.mount(api, { onMediaError() { errors++; } });
  h.mount(api, { onMediaError() { errors++; } });
  api = h.load();
  h.mount(api, { onMediaError() { errors++; } });
  assert.equal(errors, 0);
  assert.equal(h.warnings.length, 1);
});

test('iOS reports unavailable without warning or error', () => {
  const h = harness('ios');
  const api = h.load();
  h.mount(api, { onMediaError() { assert.fail('Unexpected error'); } });
  assert.equal(api.keyboardMediaAvailable, false);
  assert.equal(h.warnings.length, 0);
});

test('available module attaches, forwards the real ref and text props, and detaches', async () => {
  const attached = [];
  const detached = [];
  let removed = 0;
  const native = {
    addListener() { return { remove() { removed++; } }; },
    async attach(...args) { attached.push(args); },
    async detach(id) { detached.push(id); },
  };
  const h = harness('android', native);
  const api = h.load();
  const onChangeText = () => {};
  const mounted = h.mount(api, { value: 'hello', multiline: true, editable: false, onChangeText });
  assert.equal(api.keyboardMediaAvailable, true);
  assert.equal(mounted.ref.current, mounted.host);
  assert.equal(mounted.input.props.value, 'hello');
  assert.equal(mounted.input.props.multiline, true);
  assert.equal(mounted.input.props.editable, false);
  assert.equal(mounted.input.props.onChangeText, onChangeText);
  assert.deepEqual(attached, [[17, 'input-1']]);
  mounted.cleanup();
  await Promise.resolve();
  assert.deepEqual(detached, ['input-1']);
  assert.equal(removed, 2);
  assert.equal(h.warnings.length, 0);
});
