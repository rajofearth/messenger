import { parseArgs } from "node:util";
import {
  Agent,
  normalizeUsername,
  requireConfig,
} from "./agent-core.mjs";

const help = `Messenger web-agent

Usage:
  npm run web:agent -- <command> [options]

Commands:
  whoami                         Show the signed-in test account
  chats [--limit 50]             List conversations
  open <username>                Find or create a direct chat
  send --to <username> --text "hello"
  send --conversation <id> --text "hello"
  read --to <username> [--limit 50]
  read --conversation <id> [--limit 50]
  upload --to <username> --file .\\photo.jpg [--caption "hi"]
  upload --conversation <id> --file .\\report.pdf
  react --conversation <id> --message <messageId> [--emoji 👍|none]
  group --title "Test group" --members alice,bob
  help

Options:
  --username <name>       Override WEB_TESTER_USERNAME
  --password <value>      Override WEB_TESTER_PASSWORD
  --url <convex-url>      Override EXPO_PUBLIC_CONVEX_URL
  --json                  Print machine-readable JSON
  --reply-to <messageId>  Send a reply
  --limit <n>             Number of chats or messages (1-100)

Credentials are read from tools/web-tester/.env.local, then the process
environment. The test account is a normal password account; there is no auth
bypass in the Convex deployment.`;

function parseNumber(value, fallback, label) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 100) {
    throw new Error(`${label} must be an integer from 1 to 100.`);
  }
  return number;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printChats(chats) {
  if (!chats.length) {
    console.log("No conversations yet.");
    return;
  }
  console.table(
    chats.map((chat) => ({
      id: chat.id,
      name: chat.name,
      username: chat.username ?? (chat.group ? "(group)" : ""),
      unread: chat.unread,
      preview: chat.preview,
    })),
  );
}

function printMessages(messages) {
  if (!messages.length) {
    console.log("No messages.");
    return;
  }
  for (const message of messages) {
    const who = message.mine ? "You" : "Them";
    const when = new Date(message.createdAt).toLocaleString();
    const body = message.deleted
      ? "(deleted)"
      : message.text ||
        (message.filename
          ? `[${message.kind ?? "file"}] ${message.filename}`
          : `[${message.kind ?? "message"}]`);
    const reaction = message.reaction ? `  reaction=${message.reaction}` : "";
    console.log(`${when}  ${who}: ${body}${reaction}`);
    console.log(`  id=${message.id} sequence=${message.sequence} revision=${message.revision}`);
    if (message.replyTo) {
      console.log(`  reply-to=${message.replyTo.id} "${message.replyTo.text}"`);
    }
  }
}

function printMessage(message) {
  const body = message.text || message.filename || "(attachment)";
  console.log(`Sent ${message.id}: ${body}`);
  console.log(`  createdAt=${message.createdAt}`);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      username: { type: "string" },
      password: { type: "string" },
      url: { type: "string" },
      json: { type: "boolean", default: false },
      to: { type: "string" },
      conversation: { type: "string" },
      text: { type: "string" },
      limit: { type: "string" },
      file: { type: "string" },
      caption: { type: "string" },
      "reply-to": { type: "string" },
      message: { type: "string" },
      emoji: { type: "string" },
      title: { type: "string" },
      members: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  const command = positionals[0] ?? "help";
  const commandArgs = positionals.slice(1);
  if (command === "help" || values.help) {
    console.log(help);
    return;
  }

  const config = requireConfig({
    url: values.url,
    username: values.username,
    password: values.password,
  });
  const agent = new Agent(config);

  if (command === "whoami") {
    const profile = await agent.signIn();
    if (values.json) printJson(profile);
    else {
      console.log(`${profile.name} (@${profile.username})`);
      console.log(`userId=${profile.userId}`);
    }
    return;
  }

  if (command === "chats") {
    const chats = await agent.listChats(
      parseNumber(values.limit, 50, "--limit"),
    );
    if (values.json) printJson(chats);
    else printChats(chats);
    return;
  }

  if (command === "open") {
    const username = values.to ?? commandArgs[0];
    if (!username) throw new Error("Pass the username to open.");
    const result = await agent.openDirect(username);
    if (values.json) printJson(result);
    else {
      console.log(`conversationId=${result.id}`);
      console.log(`with=${result.target?.name} (@${result.target?.username})`);
    }
    return;
  }

  if (command === "send") {
    const text = values.text ?? commandArgs.join(" ").trim();
    if (!text) throw new Error('Pass --text "your message".');
    const message = await agent.sendText({
      to: values.to,
      conversationId: values.conversation,
      text,
      replyToMessageId: values["reply-to"],
    });
    if (values.json) printJson(message);
    else printMessage(message);
    return;
  }

  if (command === "read") {
    const { messages } = await agent.readMessages({
      to: values.to ?? commandArgs[0],
      conversationId: values.conversation,
      limit: parseNumber(values.limit, 50, "--limit"),
    });
    if (values.json) printJson(messages);
    else printMessages(messages);
    return;
  }

  if (command === "upload") {
    const filePath = values.file ?? commandArgs[0];
    if (!filePath) throw new Error("Pass --file <path>.");
    const message = await agent.uploadFile({
      to: values.to ?? commandArgs[1],
      conversationId: values.conversation,
      filePath,
      caption: values.caption,
    });
    if (values.json) printJson(message);
    else {
      console.log(`Uploaded ${message.filename ?? filePath}`);
      console.log(`messageId=${message.id}`);
      if (message.uri) console.log(`url=${message.uri}`);
    }
    return;
  }

  if (command === "react") {
    const conversationId = values.conversation ?? commandArgs[0];
    const messageId = values.message ?? commandArgs[1];
    if (!conversationId || !messageId) {
      throw new Error(
        "Pass --conversation <id> and --message <messageId>.",
      );
    }
    const requested = values.emoji ?? commandArgs[2] ?? "👍";
    const reactionKey = requested === "none" ? undefined : requested;
    await agent.react(conversationId, messageId, reactionKey);
    if (values.json) printJson({ ok: true });
    else console.log(reactionKey ? `Reacted with ${reactionKey}.` : "Removed reaction.");
    return;
  }

  if (command === "group") {
    const title = values.title ?? commandArgs[0] ?? "Test group";
    const members = (
      values.members ?? commandArgs.slice(values.title ? 0 : 1).join(",")
    )
      .split(",")
      .map(normalizeUsername)
      .filter(Boolean);
    if (!members.length) throw new Error("Pass --members alice,bob.");
    const result = await agent.createGroup(title, members);
    if (values.json) printJson(result);
    else console.log(`conversationId=${result.id}`);
    return;
  }

  throw new Error(`Unknown command: ${command}. Run with help.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
