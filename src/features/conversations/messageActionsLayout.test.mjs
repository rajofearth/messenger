import test from "node:test";
import assert from "node:assert/strict";
import { messageActionsLayout } from "./messageActionsLayout.ts";

const viewport = { height: 800, top: 24, bottom: 34 };
function assertUsable(layout, measured = 220, bounds = viewport) {
  const height = Math.min(Math.max(200, measured), layout.maxHeight);
  assert.ok(layout.top >= bounds.top + 8);
  assert.ok(layout.top + height <= bounds.height - bounds.bottom - 8);
  assert.equal(layout.minHeight, Math.min(200, layout.maxHeight));
}

test("actions prefer above the measured bubble when they fit", () => {
  const layout = messageActionsLayout({ y: 450, height: 80 }, viewport, 220);
  assert.equal(layout.top, 222);
  assertUsable(layout);
});

test("top-clipped bubble places actions below its visible bottom", () => {
  const layout = messageActionsLayout({ y: -120, height: 300 }, viewport, 220);
  assert.equal(layout.top, 188);
  assertUsable(layout);
});

test("viewport-spanning bubble clamps to safe top with usable menu height", () => {
  const layout = messageActionsLayout({ y: -400, height: 1600 }, viewport, 220);
  assert.equal(layout.top, 32);
  assert.ok(layout.maxHeight >= 200);
  assertUsable(layout);
});

test("bottom-clipped bubble still prefers above", () => {
  const layout = messageActionsLayout({ y: 700, height: 300 }, viewport, 220);
  assert.equal(layout.top, 472);
  assertUsable(layout);
});

test("small viewport keeps every action scrollable within safe bounds", () => {
  const bounds = { height: 210, top: 24, bottom: 34 };
  const layout = messageActionsLayout({ y: -5, height: 300 }, bounds, 220);
  assert.equal(layout.maxHeight, 136);
  assertUsable(layout, 220, bounds);
});
