import test from "node:test";
import assert from "node:assert/strict";
import {
  profileDate,
  profileMembership,
  sharedLinks,
} from "./ChatProfileMetadata.ts";

test("explicit membership and admins override demo data, including empty arrays", () => {
  assert.deepEqual(
    profileMembership({ id: "g1", memberIds: [], adminIds: [] }),
    { ids: [], mock: false, admins: [] },
  );
  assert.deepEqual(
    profileMembership({ id: "g1", memberIds: ["2", "2"], adminIds: ["2"] }),
    { ids: ["2"], mock: false, admins: ["2"] },
  );
});

test("only curated groups get deterministic mock members and admins", () => {
  assert.deepEqual(profileMembership({ id: "g1" }), {
    ids: ["1", "3", "4", "5"],
    mock: true,
    admins: ["1"],
  });
  assert.deepEqual(profileMembership({ id: "new-group" }), {
    ids: [],
    mock: false,
    admins: [],
  });
});

test("missing dates use an explicit January 2026 demo fallback", () => {
  assert.deepEqual(profileDate({}, []), {
    label: "January 2026",
    seeded: true,
  });
  assert.equal(
    profileDate({ createdAt: "2026-03-10T12:00:00Z" }, []).seeded,
    false,
  );
  assert.equal(
    profileDate({}, [{ createdAt: "2026-02-01T12:00:00Z" }]).seeded,
    false,
  );
  assert.equal(
    profileDate({}, [{ createdAt: "2026-02-01", deleted: true }]).seeded,
    true,
  );
});

test("links come from actual non-deleted message text, not reply previews", () => {
  assert.deepEqual(
    sharedLinks([
      {
        id: "1",
        time: "12:00",
        text: "See https://example.com/path, and https://other.example/test.",
      },
      {
        id: "2",
        time: "12:01",
        text: "https://deleted.example",
        deleted: true,
      },
      { id: "3", time: "12:02", replyTo: { text: "https://reply.example" } },
    ]),
    [
      { id: "1-0", url: "https://example.com/path", time: "12:00" },
      { id: "1-1", url: "https://other.example/test", time: "12:00" },
    ],
  );
});
