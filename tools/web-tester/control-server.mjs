import http from "node:http";
import { Agent, requireConfig } from "./agent-core.mjs";

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function requiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw badRequest(`${name} is required.`);
  }
  return value.trim();
}

function optionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberFrom(value, fallback, label) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw badRequest(`${label} must be an integer from 1 to 100.`);
  }
  return parsed;
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    request.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > 1_000_000) {
        settled = true;
        reject(badRequest("Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (settled) return;
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(badRequest("Request body must be JSON."));
      }
    });
    request.on("error", (error) => {
      if (!settled) reject(error);
    });
  });
}

let agent;
try {
  const config = requireConfig();
  agent = new Agent(config);
  await agent.signIn();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const host = process.env.WEB_TESTER_CONTROL_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.WEB_TESTER_CONTROL_PORT || 8787);
const token = process.env.WEB_TESTER_CONTROL_TOKEN?.trim() || "";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("WEB_TESTER_CONTROL_PORT must be a TCP port.");
}
if (host !== "127.0.0.1" && host !== "localhost" && !token) {
  throw new Error(
    "Set WEB_TESTER_CONTROL_TOKEN before binding the control API beyond loopback.",
  );
}

function authorized(request) {
  if (!token) return true;
  return request.headers.authorization === `Bearer ${token}`;
}

async function handle(request, response) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (request.method === "GET" && path === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && path === "/") {
    sendJson(response, 200, {
      ok: true,
      routes: [
        "GET /health",
        "GET /chats?limit=50",
        "POST /chats {username}",
        "POST /chats {title, usernames}",
        "GET /messages?conversationId=...&limit=50",
        "POST /messages {to|conversationId, text, replyToMessageId?}",
        "POST /files {to|conversationId, path, caption?}",
        "POST /reactions {conversationId, messageId, reactionKey?}",
        "POST /read {conversationId, sequence}",
      ],
    });
    return;
  }

  if (!authorized(request)) {
    sendJson(response, 401, { ok: false, error: "Unauthorized." });
    return;
  }

  if (request.method === "GET" && path === "/chats") {
    const chats = await agent.listChats(
      numberFrom(url.searchParams.get("limit"), 50, "limit"),
    );
    sendJson(response, 200, { ok: true, data: chats });
    return;
  }

  if (request.method === "POST" && path === "/chats") {
    const body = await readBody(request);
    if (Array.isArray(body.usernames)) {
      const title = requiredString(body.title ?? "Test group", "title");
      const usernames = body.usernames
        .map((value) => requiredString(value, "usernames[]"))
        .filter(Boolean);
      const result = await agent.createGroup(title, usernames);
      sendJson(response, 200, { ok: true, data: result });
      return;
    }
    const username = requiredString(body.username, "username");
    const result = await agent.openDirect(username);
    sendJson(response, 200, { ok: true, data: result });
    return;
  }

  if (request.method === "GET" && path === "/messages") {
    const conversationId = requiredString(
      url.searchParams.get("conversationId"),
      "conversationId",
    );
    const { messages } = await agent.readMessages({
      conversationId,
      limit: numberFrom(url.searchParams.get("limit"), 50, "limit"),
    });
    sendJson(response, 200, { ok: true, data: messages });
    return;
  }

  if (request.method === "POST" && path === "/messages") {
    const body = await readBody(request);
    const text = requiredString(body.text, "text");
    const message = await agent.sendText({
      to: optionalString(body.to),
      conversationId: optionalString(body.conversationId),
      text,
      replyToMessageId: optionalString(body.replyToMessageId),
    });
    sendJson(response, 200, { ok: true, data: message });
    return;
  }

  if (request.method === "POST" && path === "/files") {
    const body = await readBody(request);
    const message = await agent.uploadFile({
      to: optionalString(body.to),
      conversationId: optionalString(body.conversationId),
      filePath: requiredString(body.path, "path"),
      caption: optionalString(body.caption),
    });
    sendJson(response, 200, { ok: true, data: message });
    return;
  }

  if (request.method === "POST" && path === "/reactions") {
    const body = await readBody(request);
    await agent.react(
      requiredString(body.conversationId, "conversationId"),
      requiredString(body.messageId, "messageId"),
      optionalString(body.reactionKey),
    );
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && path === "/read") {
    const body = await readBody(request);
    const sequence = Number(body.sequence);
    if (!Number.isFinite(sequence) || sequence < 0) {
      throw badRequest("sequence must be a non-negative number.");
    }
    await agent.markRead(
      requiredString(body.conversationId, "conversationId"),
      sequence,
    );
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 404, { ok: false, error: "Not found." });
}

const server = http.createServer((request, response) => {
  void handle(request, response).catch((error) => {
    const status = Number(error?.status) || 500;
    sendJson(response, status, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  });
});

server.on("error", (error) => {
  console.error(`Control API failed: ${error.message}`);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(
    `Web tester control API listening on http://${host}:${port} as @${agent.profile.username}`,
  );
  console.log(
    "Routes: GET /health, GET /chats, POST /messages, POST /files, POST /reactions, POST /read",
  );
  if (token) console.log("Bearer token authentication is enabled.");
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
