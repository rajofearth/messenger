import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { ChatSummary, Profile } from "./types";
import { errorMessage, initials, timeLabel } from "./util";

type Props = {
  profile: Profile | null;
  chats: ChatSummary[] | undefined;
  loading: boolean;
  selected: string | null;
  notice: string | null;
  onSelect: (chat: ChatSummary) => void;
  onCreated: (conversationId: string) => void;
  onSignOut: () => void;
};

export default function Sidebar({
  profile,
  chats,
  loading,
  selected,
  notice,
  onSelect,
  onCreated,
  onSignOut,
}: Props) {
  const createDirect = useMutation(api.chat.createDirect);
  const createGroup = useMutation(api.chat.createGroup);
  const [username, setUsername] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMembers, setGroupMembers] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startDirect(event: React.FormEvent) {
    event.preventDefault();
    const handle = username.trim().replace(/^@/, "");
    if (!handle) {
      setError("Enter the username of the person to message.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await createDirect({ username: handle });
      setUsername("");
      onCreated(result.id);
    } catch (startError) {
      setError(errorMessage(startError));
    } finally {
      setBusy(false);
    }
  }

  async function startGroup(event: React.FormEvent) {
    event.preventDefault();
    const members = groupMembers
      .split(",")
      .map((member) => member.trim().replace(/^@/, ""))
      .filter(Boolean);
    if (!members.length) {
      setError("Enter at least one member username.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await createGroup({
        title: groupTitle.trim() || "Test group",
        usernames: members,
      });
      setGroupTitle("");
      setGroupMembers("");
      onCreated(result.id);
    } catch (startError) {
      setError(errorMessage(startError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <div className="brand-row">
          <div className="brand-mark small">M</div>
          <div>
            <p className="eyebrow">Messenger</p>
            <h1>Web tester</h1>
          </div>
        </div>
        {profile && (
          <div className="profile-card">
            <Avatar name={profile.name} url={profile.avatarUrl} />
            <div className="profile-copy">
              <strong>{profile.name}</strong>
              <span>@{profile.username}</span>
            </div>
            <button className="ghost-button" onClick={onSignOut} type="button">
              Sign out
            </button>
          </div>
        )}
      </header>

      <section className="new-chat">
        <form onSubmit={(event) => void startDirect(event)}>
          <label className="field compact">
            <span>Message someone</span>
            <div className="inline-form">
              <input
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
              <button className="primary-button small" disabled={busy} type="submit">
                Open
              </button>
            </div>
          </label>
        </form>

        <details className="group-form">
          <summary>Start a group</summary>
          <form onSubmit={(event) => void startGroup(event)}>
            <label className="field compact">
              <span>Group name</span>
              <input
                placeholder="Weekend plans"
                value={groupTitle}
                onChange={(event) => setGroupTitle(event.target.value)}
              />
            </label>
            <label className="field compact">
              <span>Members, comma separated</span>
              <input
                autoCapitalize="none"
                placeholder="alice, bob"
                value={groupMembers}
                onChange={(event) => setGroupMembers(event.target.value)}
              />
            </label>
            <button className="secondary-button small" disabled={busy} type="submit">
              Create group
            </button>
          </form>
        </details>

        {(error || notice) && (
          <p className="form-error sidebar-error">{error || notice}</p>
        )}
      </section>

      <section className="chat-list" aria-label="Conversations">
        <div className="section-heading">
          <span>Chats</span>
          <span>{chats?.length ?? 0}</span>
        </div>
        {loading && <p className="muted-line">Loading conversations…</p>}
        {!loading && !chats?.length && (
          <p className="muted-line">
            No conversations yet. Start one with a username above.
          </p>
        )}
        {chats?.map((chat) => (
          <button
            className={`chat-row ${selected === chat.id ? "active" : ""}`}
            key={chat.id}
            onClick={() => onSelect(chat)}
            type="button"
          >
            <Avatar name={chat.name} url={chat.avatar} />
            <span className="chat-row-copy">
              <span className="chat-row-top">
                <strong>{chat.name}</strong>
                <span className="chat-time">
                  {timeLabel(chat.lastMessageAt)}
                </span>
              </span>
              <span className="chat-row-bottom">
                <span className="chat-preview">
                  {chat.group ? "Group · " : ""}
                  {chat.preview}
                </span>
                {chat.unread > 0 && (
                  <span className="unread-badge">{chat.unread}</span>
                )}
              </span>
            </span>
          </button>
        ))}
      </section>

      <details className="agent-help">
        <summary>Agent commands</summary>
        <p>
          The same test user can be driven from a terminal without this page:
        </p>
        <code>npm run web:agent -- chats</code>
        <code>npm run web:agent -- send --to &lt;username&gt; --text "hello"</code>
        <code>npm run web:agent -- read --to &lt;username&gt;</code>
        <code>npm run web:agent -- upload --to &lt;username&gt; --file .\photo.jpg</code>
        <p>
          Or run the local control API with <code>npm run web:control</code>.
          Details are in <code>tools/web-tester/README.md</code>.
        </p>
      </details>
    </aside>
  );
}

function Avatar({ name, url }: { name: string; url?: string | null }) {
  return (
    <span className="avatar">
      {url ? <img alt="" src={url} /> : initials(name)}
    </span>
  );
}
