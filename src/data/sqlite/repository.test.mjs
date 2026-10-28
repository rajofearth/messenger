import test from "node:test";
import assert from "node:assert/strict";
import { chat, message, pending, setup } from "./testSupport.mjs";

test("the thread read is the newest confirmed page plus pending sends", async () => {
  const { repository: repo } = await setup();
  const thread = Array.from({ length: 150 }, (_, index) =>
    message(`m${index + 1}`, index + 1),
  );
  await repo.saveMessages("a", thread);

  const newest = await repo.loadMessages("a");
  assert.equal(newest.length, 100);
  assert.equal(newest[0].id, "m51");
  assert.equal(newest[99].id, "m150");
  assert.deepEqual(
    newest.map((item) => item.sequence),
    Array.from({ length: 100 }, (_, index) => index + 51),
  );

  const older = await repo.loadOlderMessages("a", 51);
  assert.equal(older.length, 50);
  assert.equal(older[0].id, "m1");
  assert.equal(older[49].id, "m50");

  assert.equal(await repo.threadHasOlder("a"), false);
  await repo.saveMessages("b", thread.slice(100));
  assert.equal(await repo.threadHasOlder("b"), true);
  await repo.markThreadExhausted("b");
  assert.equal(await repo.threadHasOlder("b"), false);

  await repo.saveOutbox([{ chatId: "b", message: pending("p1") }]);
  const withPending = await repo.loadMessages("b");
  assert.equal(withPending.length, 51);
  assert.equal(withPending[50].id, "p1");
  assert.equal(withPending[50].status, "sending");
});

test("thread saves upsert without deleting rows the snapshot left out", async () => {
  const { repository: repo } = await setup();
  await repo.saveMessages("a", [message("m1", 1), message("m2", 2)]);
  await repo.saveMessages("a", [
    message("m2", 2, { reaction: "heart" }),
    message("m3", 3),
  ]);

  const thread = await repo.loadMessages("a");
  assert.deepEqual(thread.map((item) => item.id), ["m1", "m2", "m3"]);
  assert.equal(thread[1].reaction, "heart");

  await repo.saveMessages("a", []);
  assert.deepEqual(
    (await repo.loadMessages("a")).map((item) => item.id),
    ["m1", "m2", "m3"],
  );

  await repo.saveChats([chat("a"), chat("b")]);
  await repo.saveChats([chat("a", { preview: "new" })]);
  const chats = await repo.loadChats();
  assert.deepEqual(chats.map((item) => item.id), ["a", "b"]);
  assert.equal(chats[0].preview, "new");
});

test("a message-only conversation does not appear in the cached inbox", async () => {
  const { repository: repo } = await setup();
  await repo.saveMessages("ghost", [message("m1", 1)]);
  assert.equal(await repo.loadChats(), undefined);
  await repo.saveChats([chat("ghost")]);
  assert.deepEqual(
    (await repo.loadChats()).map((item) => item.id),
    ["ghost"],
  );
});

test("a confirmed message keeps reply, reaction, variants, paths and previews", async () => {
  const { repository: repo } = await setup();
  const rich = message("m1", 7, {
    text: "caption",
    mine: true,
    kind: "image",
    mimeType: "image/jpeg",
    filename: "photo.jpg",
    width: 1080,
    height: 1440,
    duration: 3.5,
    uri: "file:///media/original.jpg",
    previewUri: "file:///media/preview.jpg",
    previewWidth: 360,
    variants: [
      {
        name: "small",
        uri: "file:///media/small.jpg",
        width: 360,
        height: 480,
        mimeType: "image/jpeg",
      },
      {
        name: "large",
        uri: "https://cdn.example/large.jpg",
        width: 1080,
        height: 1440,
      },
    ],
    replyTo: { id: "m0", text: "earlier", mine: false, kind: "image" },
    forwarded: true,
    albumId: "album-1",
    reaction: "fire",
    revision: 3,
    storageId: "storage-9",
    uploadProgress: 1,
  });
  await repo.saveMessages("a", [rich, message("m2", 8, { deleted: true })]);

  const [stored] = await repo.loadMessages("a");
  assert.equal(stored.id, "m1");
  assert.equal(stored.sequence, 7);
  assert.equal(stored.status, undefined);
  assert.equal(stored.text, "caption");
  assert.equal(stored.mine, true);
  assert.equal(stored.kind, "image");
  assert.equal(stored.mimeType, "image/jpeg");
  assert.equal(stored.filename, "photo.jpg");
  assert.equal(stored.width, 1080);
  assert.equal(stored.height, 1440);
  assert.equal(stored.duration, 3.5);
  assert.equal(stored.uri, "file:///media/original.jpg");
  assert.equal(stored.previewUri, "file:///media/preview.jpg");
  assert.equal(stored.previewWidth, 360);
  assert.equal(stored.forwarded, true);
  assert.equal(stored.albumId, "album-1");
  assert.equal(stored.reaction, "fire");
  assert.equal(stored.revision, 3);
  assert.equal(stored.storageId, "storage-9");
  assert.equal(stored.uploadProgress, 1);
  assert.deepEqual(stored.replyTo, {
    id: "m0",
    text: "earlier",
    mine: false,
    kind: "image",
  });
  assert.deepEqual(stored.variants.map((variant) => variant.name), [
    "small",
    "large",
  ]);
  assert.equal(stored.variants[0].uri, "file:///media/small.jpg");
  assert.equal(stored.variants[0].mimeType, "image/jpeg");
  assert.equal(stored.variants[1].uri, "https://cdn.example/large.jpg");
});

test("clearing a thread hides old rows and resets the inbox projection", async () => {
  const { repository: repo } = await setup();
  const old = [message("m1", 1), message("m2", 2)];
  await repo.saveChats([
    chat("a", {
      unread: 4,
      preview: "old",
      time: "09:00",
      lastMessageAt: 123,
      lastMessageStatus: "sent",
    }),
  ]);
  await repo.saveMessages("a", old);
  assert.equal((await repo.loadMessages("a")).length, 2);

  await repo.clearMessages("a");
  assert.deepEqual(await repo.loadMessages("a"), []);

  const [cleared] = await repo.loadChats();
  assert.equal(cleared.preview, "No messages yet");
  assert.equal(cleared.time, "");
  assert.equal(cleared.unread, 0);
  assert.equal(cleared.lastMessageAt, undefined);
  assert.equal(cleared.lastMessageStatus, undefined);

  await repo.saveMessages("a", old);
  assert.deepEqual(await repo.loadMessages("a"), []);

  await repo.saveMessages("a", [
    message("fresh", 3, {
      createdAt: new Date(Date.now() + 60_000).toISOString(),
    }),
  ]);
  assert.deepEqual(
    (await repo.loadMessages("a")).map((item) => item.id),
    ["fresh"],
  );
});

test("the outbox round-trips local fields and clears removed rows", async () => {
  const { repository: repo } = await setup();
  const queued = pending("p1", {
    status: "failed",
    uri: "file:///media/photo.jpg",
    storageId: "storage-1",
    uploadProgress: 0.5,
    text: "hello",
  });
  await repo.saveOutbox([{ chatId: "a", message: queued }]);

  const stored = await repo.loadOutbox();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].chatId, "a");
  assert.equal(stored[0].message.id, "p1");
  assert.equal(stored[0].message.status, "failed");
  assert.equal(stored[0].message.sequence, undefined);
  assert.equal(stored[0].message.uri, "file:///media/photo.jpg");
  assert.equal(stored[0].message.storageId, "storage-1");
  assert.equal(stored[0].message.uploadProgress, 0.5);
  assert.equal((await repo.loadMessages("a")).length, 1);

  await repo.saveOutbox([]);
  assert.deepEqual(await repo.loadOutbox(), []);
  assert.deepEqual(await repo.loadMessages("a"), []);
});

test("a stale queue snapshot cannot revive a confirmed row", async () => {
  const { database, repository: repo } = await setup();
  const queued = pending("p1", { text: "hello" });
  await repo.saveOutbox([{ chatId: "a", message: queued }]);

  // The receipt lands (same id, now with a sequence) before the queue write
  // that should have removed the entry; the next snapshot names it again.
  await repo.saveMessages("a", [message("p1", 4, { text: "hello" })]);
  assert.deepEqual(await repo.loadOutbox(), []);

  await repo.saveOutbox([{ chatId: "a", message: queued }]);
  assert.deepEqual(await repo.loadOutbox(), []);
  const rows = await database.getAllAsync("SELECT message_id FROM outbox");
  assert.deepEqual(rows, []);

  const [stored] = await repo.loadMessages("a");
  assert.equal(stored.id, "p1");
  assert.equal(stored.sequence, 4);
});

test("deleting one message removes it and its pending outbox row", async () => {
  const { repository: repo } = await setup();
  await repo.saveMessages("a", [message("m1", 1), message("m2", 2)]);
  await repo.saveOutbox([{ chatId: "a", message: pending("p1") }]);

  await repo.deleteMessage("a", "m2");
  await repo.deleteMessage("a", "p1");

  assert.deepEqual(
    (await repo.loadMessages("a")).map((item) => item.id),
    ["m1"],
  );
  assert.deepEqual(await repo.loadOutbox(), []);
});

test("removing a conversation deletes its thread and queue rows", async () => {
  const { database, repository: repo } = await setup();
  await repo.saveChats([chat("a"), chat("b")]);
  await repo.saveMessages("a", [message("m1", 1)]);
  await repo.saveOutbox([{ chatId: "a", message: pending("p1") }]);

  await repo.removeMessages("a");

  assert.deepEqual(
    (await repo.loadChats()).map((item) => item.id),
    ["b"],
  );
  assert.deepEqual(await repo.loadMessages("a"), []);
  assert.deepEqual(await repo.loadOutbox(), []);
  const remaining = await database.getAllAsync("SELECT id FROM messages");
  assert.deepEqual(remaining, []);
});

test("a deleted conversation stays deleted when a late write lands", async () => {
  const { database, repository: repo } = await setup();
  await repo.saveChats([chat("a"), chat("b")]);
  await repo.saveMessages("a", [message("m1", 1), message("m2", 2)]);

  await repo.removeMessages("a");

  assert.deepEqual(
    (await repo.loadChats()).map((item) => item.id),
    ["b"],
  );
  assert.deepEqual(await repo.loadMessages("a"), []);
  assert.equal(await repo.threadHasOlder("a"), false);
  // The row is kept as a tombstone so the clear mark survives.
  const tombstone = await database.getFirstAsync(
    "SELECT hidden_at, cleared_through FROM conversations WHERE id = ?",
    "a",
  );
  assert.ok(tombstone.hidden_at > 0);
  assert.ok(tombstone.cleared_through > 0);

  // A queued page and an inbox snapshot that were already in flight land after
  // the delete. Neither may resurrect the chat or its messages.
  await repo.saveMessages("a", [message("m1", 1), message("m2", 2)]);
  await repo.saveChats([chat("a")]);
  assert.deepEqual(
    (await repo.loadChats()).map((item) => item.id),
    ["b"],
  );
  assert.deepEqual(await repo.loadMessages("a"), []);

  // A queue snapshot for the deleted chat must not park a send there either.
  await repo.saveOutbox([{ chatId: "a", message: pending("p1") }]);
  assert.deepEqual(await repo.loadOutbox(), []);
  assert.deepEqual(await repo.loadMessages("a"), []);

  // Only a snapshot whose newest message is younger than the deletion is a
  // genuine incoming message, and it starts the chat over from empty.
  await repo.saveChats([
    chat("a", { preview: "new", lastMessageAt: Date.now() + 1000 }),
  ]);
  assert.deepEqual(
    (await repo.loadChats()).map((item) => item.id),
    ["a", "b"],
  );
  await repo.saveMessages("a", [
    message("m1", 1),
    message("m3", 3, { createdAt: new Date(Date.now() + 2000).toISOString() }),
  ]);
  assert.deepEqual(
    (await repo.loadMessages("a")).map((item) => item.id),
    ["m3"],
  );
});

test("delete-for-me survives a stale page, an older read and a relaunch", async () => {
  const { database, repository: repo } = await setup();
  const variant = {
    name: "small",
    uri: "file:///media/small.jpg",
    width: 360,
    height: 480,
  };
  await repo.saveMessages("a", [
    message("m1", 1),
    message("m2", 2, { variants: [variant], reaction: "fire" }),
    message("m3", 3),
  ]);

  await repo.deleteMessage("a", "m2");

  assert.deepEqual(
    (await repo.loadMessages("a")).map((item) => item.id),
    ["m1", "m3"],
  );
  assert.deepEqual(
    (await repo.loadOlderMessages("a", 3)).map((item) => item.id),
    ["m1"],
  );
  // The message went with its variants, so nothing is left to re-download.
  assert.deepEqual(
    await database.getAllAsync("SELECT name FROM message_variants"),
    [],
  );

  // The page that still names the deleted row, from a cached query or a media
  // pass, must not put it back.
  await repo.saveMessages("a", [
    message("m1", 1),
    message("m2", 2, { variants: [variant] }),
    message("m3", 3),
  ]);

  assert.deepEqual(
    (await repo.loadMessages("a")).map((item) => item.id),
    ["m1", "m3"],
  );
  assert.deepEqual(
    (await repo.loadOlderMessages("a", 3)).map((item) => item.id),
    ["m1"],
  );
  const rows = await database.getAllAsync("SELECT id FROM messages ORDER BY id");
  assert.deepEqual(rows.map((row) => row.id), ["m1", "m3"]);
  const hidden = await database.getAllAsync(
    "SELECT message_id FROM hidden_messages",
  );
  assert.deepEqual(hidden.map((row) => row.message_id), ["m2"]);
});

test("a deleted pending send is not revived by a stale queue snapshot", async () => {
  const { repository: repo } = await setup();
  await repo.saveOutbox([{ chatId: "a", message: pending("p1") }]);

  await repo.deleteMessage("a", "p1");
  assert.deepEqual(await repo.loadOutbox(), []);

  await repo.saveOutbox([{ chatId: "a", message: pending("p1") }]);
  assert.deepEqual(await repo.loadOutbox(), []);
  assert.deepEqual(await repo.loadMessages("a"), []);
});

test("a cleared thread stops advertising older history", async () => {
  const { repository: repo } = await setup();
  await repo.saveChats([chat("a")]);
  await repo.saveMessages("a", [message("m1", 5), message("m2", 6)]);
  assert.equal(await repo.threadHasOlder("a"), true);

  // The server cleared the same range, so there is nothing older to page in;
  // offering the control would empty the thread on every scroll.
  await repo.clearMessages("a");
  assert.equal(await repo.threadHasOlder("a"), false);
});

test("story snapshots replace the previous set and keep variants", async () => {
  const { repository: repo } = await setup();
  await repo.saveStories([
    {
      id: "s1",
      name: "A",
      avatar: "",
      image: "file:///1.jpg",
      seen: false,
      caption: "one",
    },
    {
      id: "s2",
      name: "B",
      avatar: "",
      image: "file:///2.jpg",
      seen: false,
      caption: "two",
    },
  ]);

  await repo.saveStories([
    {
      id: "s2",
      name: "B",
      avatar: "",
      image: "file:///2b.jpg",
      seen: true,
      caption: "updated",
      variants: [
        {
          name: "small",
          uri: "file:///2-small.jpg",
          width: 200,
          height: 300,
        },
      ],
    },
  ]);

  const stories = await repo.loadStories();
  assert.equal(stories.length, 1);
  assert.equal(stories[0].id, "s2");
  assert.equal(stories[0].caption, "updated");
  assert.equal(stories[0].seen, true);
  assert.equal(stories[0].variants.length, 1);
  assert.equal(stories[0].variants[0].name, "small");
  assert.equal(stories[0].variants[0].uri, "file:///2-small.jpg");
});

test("signing out wipes every table and the messenger store namespace", async () => {
  const { database, driver, repository: repo } = await setup();
  await repo.saveAppearance("dark");
  await repo.savePendingCall({
    callId: "c1",
    chatId: "a",
    video: false,
    receivedAt: 5,
    timeoutMs: 30_000,
  });
  await repo.saveChats([chat("a")]);
  await repo.saveMessages("a", [message("m1", 1), message("m2", 2)]);
  await repo.deleteMessage("a", "m2");
  await repo.saveStories([
    {
      id: "s1",
      name: "A",
      avatar: "",
      image: "file:///1.jpg",
      seen: false,
      caption: "one",
    },
  ]);
  await repo.saveHistory([
    {
      id: "h1",
      chat: chat("a"),
      video: false,
      seconds: 2,
      time: "Today",
      missed: false,
    },
  ]);
  await repo.saveSettings({
    name: "Yash",
    bio: "bio",
    username: "yash",
    haptics: true,
    avatar: "",
    sound: true,
    previews: true,
    systemNotifications: true,
  });
  await repo.saveGallerySaved(["m1"]);
  await repo.saveOutbox([{ chatId: "a", message: pending("p1") }]);
  driver.data.set("notifications/v1/ledger", JSON.stringify(["n"]));

  await repo.clearAccountData();

  assert.equal(await repo.loadChats(), undefined);
  assert.equal(await repo.loadStories(), undefined);
  assert.equal(await repo.loadHistory(), undefined);
  assert.equal(await repo.loadSettings(), undefined);
  assert.equal(await repo.loadGallerySaved(), undefined);
  assert.deepEqual(await repo.loadMessages("a"), []);
  assert.deepEqual(await repo.loadOutbox(), []);
  const tombstones = await database.getFirstAsync(
    "SELECT COUNT(*) AS count FROM hidden_messages",
  );
  assert.equal(tombstones.count, 0);
  assert.equal(await repo.loadAppearance(), undefined);
  assert.equal(await repo.loadPendingCall(), undefined);

  for (const key of driver.data.keys()) {
    assert.doesNotMatch(key, /^messenger\/v2\//);
  }
  assert.equal(driver.data.has("notifications/v1/ledger"), true);
});
