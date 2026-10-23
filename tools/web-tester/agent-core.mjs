import { existsSync, readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");

const mimeByExtension = {
  ".avif": "image/avif",
  ".csv": "text/csv",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".m4a": "audio/mp4",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".zip": "application/zip",
};

function parseEnvFile(file) {
  if (!existsSync(file)) return {};
  const values = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, raw] = match;
    const value = raw.replace(/\s+#.*$/, "").trim();
    values[key] = value.replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

export function loadEnv() {
  return {
    ...parseEnvFile(path.join(repo, ".env.local")),
    ...parseEnvFile(path.join(here, ".env.local")),
    ...process.env,
  };
}

export function normalizeUsername(value) {
  return String(value ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

export function resolveConfig(overrides = {}) {
  const env = loadEnv();
  return {
    url:
      overrides.url ||
      env.WEB_TESTER_CONVEX_URL ||
      env.VITE_CONVEX_URL ||
      env.EXPO_PUBLIC_CONVEX_URL ||
      "",
    username: normalizeUsername(
      overrides.username || env.WEB_TESTER_USERNAME || "",
    ),
    password: overrides.password || env.WEB_TESTER_PASSWORD || "",
  };
}

export function requireConfig(overrides = {}) {
  const config = resolveConfig(overrides);
  const missing = [];
  if (!config.url) missing.push("a Convex URL (EXPO_PUBLIC_CONVEX_URL)");
  if (!config.username) missing.push("WEB_TESTER_USERNAME");
  if (!config.password) missing.push("WEB_TESTER_PASSWORD");
  if (missing.length) {
    throw new Error(
      `Missing ${missing.join(", ")}. Put the test account in tools/web-tester/.env.local or pass --username and --password.`,
    );
  }
  return config;
}

export function mimeFor(filePath) {
  return (
    mimeByExtension[path.extname(filePath).toLowerCase()] ||
    "application/octet-stream"
  );
}

export function kindFor(mimeType) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

function isAuthError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /AUTH_REQUIRED|not authenticated|invalid token|token (?:is )?expired/i.test(
    message,
  );
}

export class Agent {
  constructor({ url, username, password }) {
    this.url = url;
    this.username = normalizeUsername(username);
    this.password = password;
    this.client = new ConvexHttpClient(url, { logger: false });
    this.tokens = null;
    this.profile = null;
  }

  async signIn() {
    const result = await this.client.action("auth:signIn", {
      provider: "password",
      params: {
        flow: "signIn",
        username: this.username,
        email: this.username,
        password: this.password,
      },
    });
    if (!result?.tokens?.token) {
      throw new Error(
        "Sign-in did not return a token. Check the test username and password.",
      );
    }
    this.tokens = result.tokens;
    this.client.setAuth(result.tokens.token);
    await this.client.mutation("profiles:ensure", {});
    this.profile = await this.client.query("profiles:me", {});
    return this.profile;
  }

  async refresh() {
    if (!this.tokens?.refreshToken) return await this.signIn();
    const result = await this.client.action("auth:signIn", {
      refreshToken: this.tokens.refreshToken,
    });
    if (!result?.tokens?.token) return await this.signIn();
    this.tokens = result.tokens;
    this.client.setAuth(result.tokens.token);
    return this.profile;
  }

  async call(operation) {
    if (!this.tokens) await this.signIn();
    try {
      return await operation();
    } catch (error) {
      if (!isAuthError(error)) throw error;
      await this.refresh();
      return await operation();
    }
  }

  async whoami() {
    return await this.call(() => this.client.query("profiles:me", {}));
  }

  async listChats(limit = 50) {
    return await this.call(() =>
      this.client.query("chat:listInbox", { limit }),
    );
  }

  async openDirect(username) {
    return await this.call(() =>
      this.client.mutation("chat:createDirect", {
        username: normalizeUsername(username),
      }),
    );
  }

  async createGroup(title, usernames) {
    return await this.call(() =>
      this.client.mutation("chat:createGroup", {
        title: title.trim() || "Test group",
        usernames: usernames.map(normalizeUsername).filter(Boolean),
      }),
    );
  }

  async resolveConversation({ to, conversationId }) {
    if (conversationId) return conversationId;
    if (!to) {
      throw new Error("Pass --to <username> or --conversation <id>.");
    }
    const result = await this.openDirect(to);
    return result.id;
  }

  async sendText({ to, conversationId, text, replyToMessageId }) {
    const conversation = await this.resolveConversation({ to, conversationId });
    return await this.call(() =>
      this.client.mutation("chat:sendText", {
        conversationId: conversation,
        clientMessageId: crypto.randomUUID(),
        text,
        ...(replyToMessageId ? { replyToMessageId } : {}),
      }),
    );
  }

  async readMessages({ to, conversationId, limit = 50 }) {
    const conversation = await this.resolveConversation({ to, conversationId });
    return await this.call(() =>
      this.client.query("chat:listMessages", {
        conversationId: conversation,
        limit,
      }),
    );
  }

  async markRead(conversationId, sequence) {
    return await this.call(() =>
      this.client.mutation("chat:markReadThrough", {
        conversationId,
        sequence,
      }),
    );
  }

  async react(conversationId, messageId, reactionKey) {
    return await this.call(() =>
      this.client.mutation("chat:setReaction", {
        conversationId,
        messageId,
        ...(reactionKey ? { reactionKey } : {}),
      }),
    );
  }

  async uploadFile({ to, conversationId, filePath, caption }) {
    const conversation = await this.resolveConversation({ to, conversationId });
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error(`${filePath} is not a file.`);
    const filename = path.basename(filePath);
    const mimeType = mimeFor(filename);
    const bytes = await readFile(filePath);
    const uploadUrl = await this.call(() =>
      this.client.mutation("files:generateUploadUrl", {}),
    );
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": mimeType },
      body: bytes,
    });
    if (!response.ok) {
      throw new Error(`Upload failed with HTTP ${response.status}.`);
    }
    const payload = await response.json();
    if (!payload?.storageId) {
      throw new Error("The upload did not return a storage id.");
    }
    const finalized = await this.call(() =>
      this.client.mutation("files:finalizeUpload", {
        storageId: payload.storageId,
        kind: kindFor(mimeType),
        mimeType,
        filename,
        size: bytes.byteLength,
      }),
    );
    if (finalized && typeof finalized === "object" && "error" in finalized) {
      throw new Error(String(finalized.error));
    }
    return await this.call(() =>
      this.client.mutation("chat:sendAttachment", {
        conversationId: conversation,
        clientMessageId: crypto.randomUUID(),
        storageId: payload.storageId,
        caption: caption?.trim() || undefined,
      }),
    );
  }
}
