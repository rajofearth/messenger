import test from "node:test";
import assert from "node:assert/strict";
import {
  chatTimeLabel,
  daySeparatorLabel,
  localDayKey,
} from "./time.ts";

// A Wednesday afternoon, built in local time so the rules are timezone-free.
const NOW = new Date(2026, 9, 21, 15, 30);

function at(year, month, day, hour = 12, minute = 0) {
  return new Date(year, month, day, hour, minute);
}

function options() {
  return { now: NOW, locale: "en-US" };
}

test("today's chat timestamps show a localized clock time", () => {
  assert.equal(chatTimeLabel(at(2026, 9, 21, 9, 5), options()), "9:05 AM");
  assert.equal(chatTimeLabel(at(2026, 9, 21, 0, 1), options()), "12:01 AM");
  assert.equal(chatTimeLabel(at(2026, 9, 21, 15, 30), options()), "3:30 PM");
});

test("yesterday and the previous six days use words instead of numbers", () => {
  assert.equal(chatTimeLabel(at(2026, 9, 20, 22), options()), "Yesterday");
  assert.equal(chatTimeLabel(at(2026, 9, 19, 10), options()), "Mon");
  assert.equal(chatTimeLabel(at(2026, 9, 15, 10), options()), "Thu");
});

test("the seventh day falls back to a short date", () => {
  assert.equal(chatTimeLabel(at(2026, 9, 14, 10), options()), "Oct 14");
  assert.equal(chatTimeLabel(at(2025, 11, 31, 10), options()), "Dec 31, 2025");
});

test("day separators name today, yesterday, the week, then the date", () => {
  assert.equal(daySeparatorLabel(at(2026, 9, 21, 0, 1), options()), "Today");
  assert.equal(daySeparatorLabel(at(2026, 9, 20, 23, 59), options()), "Yesterday");
  assert.equal(daySeparatorLabel(at(2026, 9, 17, 10), options()), "Sat");
  assert.equal(daySeparatorLabel(at(2026, 9, 13, 10), options()), "Oct 13");
  assert.equal(daySeparatorLabel(at(2025, 0, 2, 10), options()), "Jan 2, 2025");
});

test("a local day key groups by the device's calendar, not UTC", () => {
  assert.equal(localDayKey(at(2026, 9, 21, 0, 5)), "2026-10-21");
  assert.equal(localDayKey(at(2026, 9, 21, 23, 55)), "2026-10-21");
  assert.equal(localDayKey(at(2026, 9, 22, 0, 5)), "2026-10-22");
  assert.equal(localDayKey(at(2026, 0, 2)), "2026-01-02");
});

test("midnight is a new day even when the gap is less than 24 hours", () => {
  const justAfterMidnight = new Date(2026, 9, 21, 0, 30);
  const optionsAfterMidnight = { now: justAfterMidnight, locale: "en-US" };
  assert.equal(
    chatTimeLabel(at(2026, 9, 20, 23, 50), optionsAfterMidnight),
    "Yesterday",
  );
  assert.equal(
    daySeparatorLabel(at(2026, 9, 20, 23, 50), optionsAfterMidnight),
    "Yesterday",
  );
  assert.equal(
    daySeparatorLabel(at(2026, 9, 21, 0, 10), optionsAfterMidnight),
    "Today",
  );
});

test("missing or unreadable values return null instead of a wrong date", () => {
  for (const value of [undefined, null, "", "not a date", Number.NaN, new Date("nope")]) {
    assert.equal(chatTimeLabel(value, options()), null);
    assert.equal(daySeparatorLabel(value, options()), null);
    assert.equal(localDayKey(value), null);
  }
});

test("an unreadable locale falls back to English instead of throwing", () => {
  assert.equal(
    chatTimeLabel(at(2026, 9, 21, 9, 5), { now: NOW, locale: "not a locale" }),
    "9:05 AM",
  );
});
