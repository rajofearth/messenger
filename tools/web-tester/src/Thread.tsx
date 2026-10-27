import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import MessageRow from "./MessageRow";
import type { ChatSummary, Message } from "./types";
import { errorMessage, initials, shortId } from "./util";

type UploadKind = "image" | "video" | "audio" | "file";

function uploadKind(mimeType: string): UploadKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

function uploadFailure(value: unknown): string | null {
  if (value && typeof value === "object" && "error" in value) {
    return String((value as { error: unknown }).error);
  }
  return null;
}

function newClientId(): string {
  return crypto.randomUUID();
}

export default function Thread({ chat }: { chat: ChatSummary }) {
  const messagePage = useQuery(api.chat.listMessages, {
    conversationId: chat.id,
    limit: 100,
  });
  const messages = messagePage?.messages;
  const sendText = useMutation(api.chat.sendText);
  const sendAttachment = useMutation(api.chat.sendAttachment);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const finalizeUpload = useMutation(api.files.finalizeUpload);
  const setReaction = useMutation(api.chat.setReaction);
  const markRead = useMutation(api.chat.markReadThrough);

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const lastSequence = messages?.[messages.length - 1]?.sequence;

  useEffect(() => {
    if (lastSequence === undefined) return;
    void markRead({
      conversationId: chat.id,
      sequence: lastSequence,
    }).catch(() => {});
  }, [chat.id, lastSequence, markRead]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [chat.id, messages?.length]);

  async function submitText(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      await sendText({
        conversationId: chat.id,
        clientMessageId: newClientId(),
        text,
        ...(replyTo ? { replyToMessageId: replyTo.id } : {}),
      });
      setDraft("");
      setReplyTo(null);
    } catch (sendError) {
      setError(errorMessage(sendError));
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file: File | undefined) {
    if (!file) return;
    const mimeType = file.type || "application/octet-stream";
    setUploading(true);
    setError(null);
    try {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": mimeType },
        body: file,
      });
      if (!response.ok) {
        throw new Error(`Upload failed with HTTP ${response.status}.`);
      }
      const payload = (await response.json()) as { storageId?: string };
      if (!payload.storageId) {
        throw new Error("The upload did not return a storage id.");
      }
      const storageId = payload.storageId as Id<"_storage">;
      const finalized = await finalizeUpload({
        storageId,
        kind: uploadKind(mimeType),
        mimeType,
        filename: file.name || "attachment",
        size: file.size,
      });
      const failure = uploadFailure(finalized);
      if (failure) throw new Error(failure);
      await sendAttachment({
        conversationId: chat.id,
        clientMessageId: newClientId(),
        storageId,
        caption: draft.trim() || undefined,
        ...(replyTo ? { replyToMessageId: replyTo.id } : {}),
      });
      setDraft("");
      setReplyTo(null);
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function react(message: Message, reactionKey: string) {
    setError(null);
    try {
      await setReaction({
        conversationId: chat.id,
        messageId: message.id,
        reactionKey: message.reaction === reactionKey ? undefined : reactionKey,
      });
    } catch (reactionError) {
      setError(errorMessage(reactionError));
    }
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(chat.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("The browser did not allow clipboard access.");
    }
  }

  const rows = messages ?? [];

  return (
    <section className="thread">
      <header className="thread-header">
        <span className="avatar large">
          {chat.avatar ? <img alt="" src={chat.avatar} /> : initials(chat.name)}
        </span>
        <div className="thread-title">
          <h2>{chat.name}</h2>
          <p>
            {chat.group ? "Group chat" : `@${chat.username ?? "unknown"}`}
            {chat.blocked ? " · blocked" : ""}
            {chat.muted ? " · muted" : ""}
          </p>
        </div>
        <button className="id-button" onClick={() => void copyId()} type="button">
          {copied ? "Copied" : `ID ${shortId(chat.id)}`}
        </button>
      </header>

      <div className="message-scroll">
        {messages === undefined && (
          <p className="muted-line centered">Loading messages…</p>
        )}
        {messages !== undefined && rows.length === 0 && (
          <div className="thread-empty">
            <p className="eyebrow">No messages yet</p>
            <h3>Say hello from either side.</h3>
            <p>
              Send a message here, or use{" "}
              <code>npm run web:agent -- send --to &lt;username&gt; --text "hello"</code>
              .
            </p>
          </div>
        )}
        {rows.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            onReact={(item, key) => void react(item, key)}
            onReply={setReplyTo}
          />
        ))}
        <div ref={bottom} />
      </div>

      <div className="composer-wrap">
        {error && <p className="form-error composer-error">{error}</p>}
        {replyTo && (
          <div className="reply-banner">
            <span>
              Replying to {replyTo.mine ? "your message" : chat.name}:{" "}
              {replyTo.text || replyTo.filename || "attachment"}
            </span>
            <button
              aria-label="Cancel reply"
              className="icon-button"
              onClick={() => setReplyTo(null)}
              type="button"
            >
              ×
            </button>
          </div>
        )}
        <form className="composer" onSubmit={(event) => void submitText(event)}>
          <input
            accept="image/*,video/*,audio/*,.pdf,.txt,.zip,.json,.csv"
            hidden
            onChange={(event) => void uploadFile(event.target.files?.[0])}
            ref={fileInput}
            type="file"
          />
          <button
            aria-label="Attach a file"
            className="attach-button"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            type="button"
          >
            {uploading ? "…" : "+"}
          </button>
          <textarea
            aria-label="Message"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={`Message ${chat.name}`}
            rows={1}
            value={draft}
          />
          <button
            className="send-button"
            disabled={busy || uploading || !draft.trim()}
            type="submit"
          >
            {busy ? "…" : "Send"}
          </button>
        </form>
        <p className="composer-note">
          Files are uploaded to Convex storage and sent as attachments. Press
          Enter to send; Shift+Enter adds a line.
        </p>
      </div>
    </section>
  );
}
