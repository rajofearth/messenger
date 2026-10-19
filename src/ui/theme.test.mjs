import test from "node:test";
import assert from "node:assert/strict";
import { palette, parseDeviceScheme, resolveDark } from "./theme.ts";

test("a pinned theme overrides the device scheme", () => {
  assert.equal(resolveDark("dark", "light"), true);
  assert.equal(resolveDark("dark", "dark"), true);
  assert.equal(resolveDark("light", "dark"), false);
  assert.equal(resolveDark("light", "light"), false);
});

test("the system theme follows the device scheme", () => {
  assert.equal(resolveDark("system", "dark"), true);
  assert.equal(resolveDark("system", "light"), false);
});

test("an unknown device scheme keeps the light palette", () => {
  assert.equal(resolveDark("system", "unspecified"), false);
  assert.equal(resolveDark("system", null), false);
  assert.equal(resolveDark("system", undefined), false);
});

test("a native payload counts only when it names a scheme", () => {
  assert.equal(parseDeviceScheme("dark"), "dark");
  assert.equal(parseDeviceScheme("light"), "light");
  assert.equal(parseDeviceScheme("unspecified"), null);
  assert.equal(parseDeviceScheme("Dark"), null);
  assert.equal(parseDeviceScheme(null), null);
  assert.equal(parseDeviceScheme(undefined), null);
  assert.equal(parseDeviceScheme(""), null);
  assert.equal(parseDeviceScheme(1), null);
});

function contrast(foreground, background) {
  const channel = (hex) => {
    const value = Number.parseInt(hex.slice(1), 16);
    return [value >> 16, (value >> 8) & 255, value & 255].map((part) => {
      const s = part / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
  };
  const [r, g, b] = channel(foreground);
  const [br, bg, bb] = channel(background);
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const dark = 0.2126 * br + 0.7152 * bg + 0.0722 * bb;
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}

test("outgoing message text meets normal-copy contrast in both themes", () => {
  const light = palette(false);
  const dark = palette(true);
  assert.ok(contrast(light.outgoingFg, "#F4A18B") >= 4.5);
  assert.ok(contrast(dark.outgoingFg, "#B86B57") >= 4.5);
});
