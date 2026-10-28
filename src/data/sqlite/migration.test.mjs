import test from "node:test";
import assert from "node:assert/strict";
import {
  NAMESPACE,
  chat,
  message,
  migrate,
  pending,
  repository,
  schema,
  seed,
  setup,
} from "./testSupport.mjs";

test("migration imports every legacy slice and removes only its keys", async () => {
  const { database, driver, store, repository: repo } = await setup();
  const contact = chat("a", {
    unread: 2,
    lastMessageAt: 123,
    lastMessageStatus: "sent",
    memberIds: ["u1"],
  });
  const settings = {
    name: "Yash",
    bio: "bio",
    username: "yash",
    haptics: false,
    avatar: "file:///avatar.jpg",
    sound: false,
    previews: false,
    systemNotifications: false,
  };
  seed(driver, "chats", [contact]);
  seed(driver, "messages/a", [message("m1", 2)]);
  seed(driver, "stories", [
    {
      id: "s1",
      name: "A",
      avatar: "",
      image: "file:///story.jpg",
      seen: false,
      caption: "story",
    },
  ]);
  seed(driver, "history", [
    {
      id: "h1",
      chat: contact,
      video: true,
      seconds: 42,
      time: "Yesterday",
      missed: false,
    },
  ]);
  seed(driver, "settings", settings);
  seed(driver, "gallery-saved", ["m1"]);
  seed(driver, "outbox", [
    {
      chatId: "a",
      message: pending("p1", { uri: "file:///media/photo.jpg" }),
    },
  ]);
  seed(driver, "appearance", { theme: "dark" });
  seed(driver, "update", { dismissedVersionCode: 12 });
  seed(driver, "pending-call", {
    callId: "c1",
    chatId: "a",
    video: false,
    receivedAt: 5,
    timeoutMs: 30_000,
  });
  driver.data.set("notifications/v1/ledger", JSON.stringify(["n"]));

  await migrate.migrateLegacy(database, store);

  const chats = await repo.loadChats();
  assert.equal(chats.length, 1);
  assert.equal(chats[0].id, "a");
  assert.equal(chats[0].unread, 2);
  assert.deepEqual(chats[0].memberIds, ["u1"]);

  const thread = await repo.loadMessages("a");
  assert.deepEqual(thread.map((item) => item.id), ["m1", "p1"]);
  assert.equal(thread[1].uri, "file:///media/photo.jpg");
  assert.equal(thread[1].status, "sending");

  const stories = await repo.loadStories();
  assert.equal(stories.length, 1);
  assert.equal(stories[0].caption, "story");

  const history = await repo.loadHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].id, "h1");
  assert.equal(history[0].chat.id, "a");
  assert.equal(history[0].seconds, 42);

  assert.deepEqual(await repo.loadSettings(), settings);
  assert.deepEqual(await repo.loadGallerySaved(), ["m1"]);
  assert.equal((await repo.loadOutbox())[0].message.id, "p1");

  assert.deepEqual(await repo.loadAppearance(), { theme: "dark" });
  assert.deepEqual(await repo.loadDismissedRelease(), {
    dismissedVersionCode: 12,
  });
  assert.equal((await repo.loadPendingCall()).callId, "c1");

  for (const key of [
    "chats",
    "stories",
    "history",
    "settings",
    "gallery-saved",
    "outbox",
    "messages/a",
  ]) {
    assert.equal(driver.data.has(`${NAMESPACE}/${key}`), false, key);
  }
  assert.equal(driver.data.has(`${NAMESPACE}/appearance`), true);
  assert.equal(driver.data.has(`${NAMESPACE}/update`), true);
  assert.equal(driver.data.has(`${NAMESPACE}/pending-call`), true);
  assert.equal(driver.data.has("notifications/v1/ledger"), true);

  const complete = await database.getFirstAsync(
    "SELECT value FROM migration_state WHERE key = ?",
    migrate.LEGACY_COMPLETE_KEY,
  );
  assert.ok(complete);
});

test("migration resumes after a failed cleanup without importing twice", async () => {
  const { database, driver, store } = await setup();
  seed(driver, "chats", [chat("a")]);
  seed(driver, "messages/a", [message("m1", 1)]);

  let failed = false;
  const failing = {
    ...store,
    save: async (key, value) => {
      if (!failed && key === "chats" && value === null) {
        failed = true;
        throw new Error("disk full");
      }
      return store.save(key, value);
    },
  };

  await assert.rejects(migrate.migrateLegacy(database, failing), /disk full/);
  assert.equal(failed, true);
  assert.equal(driver.data.has(`${NAMESPACE}/messages/a`), true);

  await migrate.migrateLegacy(database, store);
  assert.equal(driver.data.has(`${NAMESPACE}/chats`), false);
  assert.equal(driver.data.has(`${NAMESPACE}/messages/a`), false);

  const repo = repository.createMessengerRepository(
    store,
    Promise.resolve(database),
  );
  assert.deepEqual(
    (await repo.loadMessages("a")).map((item) => item.id),
    ["m1"],
  );
  const count = await database.getFirstAsync(
    "SELECT COUNT(*) AS count FROM messages",
  );
  assert.equal(count.count, 1);
});

test("per-chat markers survive a restart and skip imported threads", async () => {
  const { database, driver, store } = await setup();
  seed(driver, "chats", [chat("a")]);
  seed(driver, "messages/a", [message("m1", 1)]);
  await migrate.migrateLegacy(database, store);

  await database.runAsync(
    "DELETE FROM migration_state WHERE key IN (?, ?)",
    migrate.LEGACY_IMPORTED_KEY,
    migrate.LEGACY_COMPLETE_KEY,
  );
  seed(driver, "chats", [chat("a")]);
  seed(driver, "messages/a", [message("m1", 1), message("m2", 2)]);

  await migrate.migrateLegacy(database, store);

  const repo = repository.createMessengerRepository(
    store,
    Promise.resolve(database),
  );
  assert.deepEqual(
    (await repo.loadMessages("a")).map((item) => item.id),
    ["m1"],
  );
  assert.equal(driver.data.has(`${NAMESPACE}/messages/a`), false);
  const complete = await database.getFirstAsync(
    "SELECT value FROM migration_state WHERE key = ?",
    migrate.LEGACY_COMPLETE_KEY,
  );
  assert.ok(complete);
});

test("a legacy thread without its chat still becomes a reachable chat", async () => {
  const { database, driver, store, repository: repo } = await setup();
  seed(driver, "chats", [chat("a")]);
  // The old store listed a thread for a chat its inbox slice never held.
  seed(driver, "messages/orphan-chat", [message("m1", 3), message("m2", 4)]);

  await migrate.migrateLegacy(database, store);

  const chats = await repo.loadChats();
  const orphan = chats.find((item) => item.id === "orphan-chat");
  assert.ok(orphan, "an orphaned thread must stay reachable");
  assert.equal(orphan.name, migrate.orphanChatName("orphan-chat"));
  assert.deepEqual(
    (await repo.loadMessages("orphan-chat")).map((item) => item.id),
    ["m1", "m2"],
  );
  // The old keys only go after both copies are safe.
  assert.equal(driver.data.has(`${NAMESPACE}/messages/orphan-chat`), false);
  const count = await database.getFirstAsync(
    "SELECT COUNT(*) AS count FROM messages",
  );
  assert.equal(count.count, 2);
});

test("a kill between the inbox and the threads still imports the threads", async () => {
  const { database, driver, store, repository: repo } = await setup();
  seed(driver, "chats", [chat("a")]);
  seed(driver, "messages/a", [message("m1", 1)]);
  // The slice phase committed and the process died before the threads ran.
  await database.runAsync(
    "INSERT INTO migration_state (key, value) VALUES (?, '1')",
    migrate.LEGACY_IMPORTED_KEY,
  );

  await migrate.migrateLegacy(database, store);

  assert.deepEqual(
    (await repo.loadMessages("a")).map((item) => item.id),
    ["m1"],
  );
  assert.equal(driver.data.has(`${NAMESPACE}/messages/a`), false);
  const threads = await database.getFirstAsync(
    "SELECT value FROM migration_state WHERE key = ?",
    migrate.LEGACY_THREADS_KEY,
  );
  assert.ok(threads);
});

test("upgrading a version 1 database adds tombstones and keeps its rows", async () => {
  const { database, repository: repo } = await setup();
  await repo.saveChats([chat("a")]);
  await repo.saveMessages("a", [message("m1", 1)]);

  // Put the file back in the shape version 1 left on disk.
  await database.execAsync("DROP TABLE hidden_messages");
  await database.execAsync("PRAGMA user_version = 1");
  await schema.applySchema(database);

  const version = await database.getFirstAsync("PRAGMA user_version");
  assert.equal(version.user_version, schema.SCHEMA_VERSION);
  assert.deepEqual(
    (await repo.loadMessages("a")).map((item) => item.id),
    ["m1"],
  );

  await repo.deleteMessage("a", "m1");
  await repo.saveMessages("a", [message("m1", 1)]);
  assert.deepEqual(await repo.loadMessages("a"), []);
});
