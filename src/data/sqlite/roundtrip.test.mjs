import test from "node:test";
import assert from "node:assert/strict";
import { chat, message, pending, setup } from "./testSupport.mjs";

/**
 * Rows read back from SQLite spell every optional key out with `undefined`,
 * while a hand-written fixture names only the fields it sets. Dropping the
 * undefined keys from both sides compares what a record means instead of how
 * the object was built. A field the reader lost stays a difference, because
 * the fixture still names it with a real value.
 */
function defined(value) {
  if (Array.isArray(value)) return value.map(defined);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, defined(item)]),
    );
  }
  return value;
}

function assertSameRecord(actual, expected) {
  assert.deepEqual(defined(actual), defined(expected));
}

/** Every ChatRecord field set, so one dropped column shows up here. */
const contact = {
  id: "c-full",
  name: "Asha Rao",
  avatar: "file:///media/avatars/asha.jpg",
  preview: "see you at six",
  time: "09:41",
  unread: 3,
  online: true,
  typing: true,
  group: true,
  color: "#3d7bfd",
  username: "asha",
  bio: "designer",
  createdAt: "2025-01-02T03:04:05.000Z",
  memberIds: ["u1", "u2", "u3"],
  adminIds: ["u1"],
  muted: true,
  blocked: false,
  pinned: true,
  mediaVisibility: "gallery",
  lastMessageAt: 1_760_000_000_000,
  lastMessageStatus: "sent",
};

test("a confirmed outgoing message keeps variants, reply, reaction and revision", async () => {
  const { repository: repo } = await setup();
  const outgoing = {
    id: "m-out",
    text: "the revised plan",
    mine: true,
    time: "09:41",
    kind: "image",
    replyTo: {
      id: "m-in",
      text: "send me the plan",
      mine: false,
      kind: "file",
    },
    forwarded: true,
    createdAt: "2026-10-27T09:41:12.345Z",
    albumId: "album-9",
    mimeType: "image/webp",
    width: 1600,
    height: 1200,
    uri: "file:///media/uploads/plan.webp",
    variants: [
      {
        name: "small",
        uri: "file:///media/uploads/plan-320.webp",
        width: 320,
        height: 240,
        mimeType: "image/webp",
      },
      {
        name: "large",
        uri: "https://cdn.example/plan-1600.webp",
        width: 1600,
        height: 1200,
        mimeType: "image/webp",
      },
    ],
    previewUri: "file:///media/uploads/plan-preview.webp",
    previewWidth: 320,
    filename: "plan.webp",
    reaction: "🔥",
    sequence: 42,
    revision: 7,
  };

  await repo.saveMessages("a", [outgoing]);

  const [stored] = await repo.loadMessages("a");
  assertSameRecord(stored, outgoing);
  assert.equal(stored.variants.length, 2);
  assert.equal(stored.variants[1].uri, "https://cdn.example/plan-1600.webp");
});

test("an incoming video keeps its duration, filename and dimensions", async () => {
  const { repository: repo } = await setup();
  const incoming = {
    id: "m-video",
    text: "look at this",
    mine: false,
    time: "08:15",
    kind: "video",
    mimeType: "video/mp4",
    filename: "clip.mp4",
    width: 1920,
    height: 1080,
    duration: 13.5,
    uri: "https://cdn.example/clip.mp4",
    previewUri: "file:///media/cache/clip-preview.jpg",
    previewWidth: 480,
    createdAt: "2026-10-26T18:04:00.000Z",
    sequence: 41,
  };

  await repo.saveMessages("a", [incoming]);

  const [stored] = await repo.loadMessages("a");
  assertSameRecord(stored, incoming);
  assert.equal(stored.duration, 13.5);
  assert.equal(stored.filename, "clip.mp4");
});

test("a pending send keeps its delivery state and local attachment fields", async () => {
  const { repository: repo } = await setup();
  const queued = {
    id: "p-thread",
    text: "uploading now",
    mine: true,
    time: "09:44",
    kind: "image",
    albumId: "album-10",
    mimeType: "image/jpeg",
    filename: "selfie.jpg",
    width: 1080,
    height: 1440,
    uri: "file:///media/outbox/selfie.jpg",
    previewUri: "file:///media/outbox/selfie-preview.jpg",
    previewWidth: 360,
    createdAt: "2026-10-27T09:44:02.000Z",
    status: "sending",
    uploadProgress: 0.5,
    storageId: "storage-thread",
  };

  await repo.saveMessages("a", [queued]);

  const thread = await repo.loadMessages("a");
  assert.equal(thread.length, 1);
  assertSameRecord(thread[0], queued);
  assert.equal(thread[0].sequence, undefined);
});

test("a chat keeps every inbox and contact field", async () => {
  const { repository: repo } = await setup();
  await repo.saveChats([contact, chat("c-other")]);

  const chats = await repo.loadChats();
  assert.equal(chats.length, 2);
  assertSameRecord(
    chats.find((item) => item.id === contact.id),
    contact,
  );
});

test("a story keeps variants, preview, framing, expiry and upload state", async () => {
  const { repository: repo } = await setup();
  const story = {
    id: "s-full",
    name: "Asha",
    avatar: "file:///media/avatars/asha.jpg",
    image: "file:///media/stories/beach.jpg",
    variants: [
      {
        name: "small",
        uri: "file:///media/stories/beach-480.jpg",
        width: 480,
        height: 720,
        mimeType: "image/jpeg",
      },
      {
        name: "large",
        uri: "https://cdn.example/beach-1080.jpg",
        width: 1080,
        height: 1620,
        mimeType: "image/jpeg",
      },
    ],
    width: 1080,
    height: 1620,
    previewUri: "file:///media/stories/beach-preview.jpg",
    previewWidth: 480,
    mimeType: "image/jpeg",
    seen: true,
    caption: "last light",
    video: true,
    crop: "fill",
    ownerId: "u1",
    createdAt: 1_760_100_000_000,
    expiresAt: 1_760_186_400_000,
    uploadStatus: "uploading",
    uploadProgress: 0.62,
  };

  await repo.saveStories([story]);

  const [stored] = await repo.loadStories();
  assertSameRecord(stored, story);
  assert.equal(stored.variants.length, 2);
});

test("settings keep every profile and notification value", async () => {
  const { repository: repo } = await setup();
  const settings = {
    name: "Yashraj",
    bio: "building messenger",
    username: "yash",
    haptics: false,
    avatar: "file:///media/avatars/me.jpg",
    sound: true,
    previews: false,
    systemNotifications: true,
  };

  await repo.saveSettings(settings);

  assertSameRecord(await repo.loadSettings(), settings);
});

test("call history keeps the contact snapshot and call details", async () => {
  const { repository: repo } = await setup();
  const record = {
    id: "h-full",
    chat: contact,
    video: true,
    seconds: 92.5,
    time: "Yesterday",
    missed: false,
  };

  await repo.saveHistory([record]);

  const [stored] = await repo.loadHistory();
  assertSameRecord(stored, record);
  assertSameRecord(stored.chat, contact);
});

test("the outbox keeps a failed send and its finalized upload", async () => {
  const { repository: repo } = await setup();
  const record = {
    chatId: contact.id,
    message: {
      id: "p-outbox",
      text: "this one is stuck",
      mine: true,
      time: "09:47",
      kind: "image",
      albumId: "album-10",
      mimeType: "image/jpeg",
      filename: "selfie.jpg",
      width: 1080,
      height: 1440,
      uri: "file:///media/outbox/selfie.jpg",
      previewUri: "file:///media/outbox/selfie-preview.jpg",
      previewWidth: 360,
      createdAt: "2026-10-27T09:47:02.000Z",
      status: "failed",
      uploadProgress: 0.42,
      storageId: "storage-outbox",
    },
  };

  await repo.saveOutbox([record]);

  const [stored] = await repo.loadOutbox();
  assertSameRecord(stored, record);
  assert.equal(stored.message.status, "failed");
});

test("the thread read is the newest confirmed page, ascending, then pending", async () => {
  const { repository: repo } = await setup();
  await repo.saveMessages(
    "a",
    Array.from({ length: 150 }, (_, index) => message(`m${index + 1}`, index + 1)),
  );
  await repo.saveOutbox([
    { chatId: "a", message: pending("p1") },
    { chatId: "a", message: pending("p2") },
  ]);

  const thread = await repo.loadMessages("a");
  assert.equal(thread.length, 102);
  assert.deepEqual(thread.map((item) => item.id), [
    ...Array.from({ length: 100 }, (_, index) => `m${index + 51}`),
    "p1",
    "p2",
  ]);
  assert.deepEqual(
    thread.slice(0, 100).map((item) => item.sequence),
    Array.from({ length: 100 }, (_, index) => index + 51),
  );
  assert.deepEqual(
    thread.slice(100).map((item) => item.sequence),
    [undefined, undefined],
  );

  const older = await repo.loadOlderMessages("a", 51);
  assert.deepEqual(
    older.map((item) => item.id),
    Array.from({ length: 50 }, (_, index) => `m${index + 1}`),
  );
  assert.deepEqual(await repo.loadOlderMessages("a", 1), []);
});

test("the cached inbox follows the newest snapshot order", async () => {
  const { repository: repo } = await setup();
  await repo.saveChats([chat("zulu"), chat("alpha"), chat("mike")]);
  await repo.saveChats([chat("mike"), chat("zulu"), chat("alpha")]);

  assert.deepEqual(
    (await repo.loadChats()).map((item) => item.id),
    ["mike", "zulu", "alpha"],
  );
});

test("a deleted message is stored as a tombstone and hidden from reads", async () => {
  const { database, repository: repo } = await setup();
  // A tombstone can never come back through `loadMessages` (that is the point
  // of `deleted`), so the stored flag is checked where the reader looks.
  await repo.saveMessages("a", [
    message("m-gone", 9, { deleted: true }),
    message("m-live", 10),
  ]);

  assert.deepEqual(
    (await repo.loadMessages("a")).map((item) => item.id),
    ["m-live"],
  );
  const row = await database.getFirstAsync(
    "SELECT sequence, deleted FROM messages WHERE id = ?",
    "m-gone",
  );
  assert.deepEqual({ ...row }, { sequence: 9, deleted: 1 });
});
