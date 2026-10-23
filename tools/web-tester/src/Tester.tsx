import { useEffect, useMemo, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import Sidebar from "./Sidebar";
import Thread from "./Thread";
import type { ChatSummary, Profile } from "./types";
import { errorMessage } from "./util";

export default function Tester() {
  const { signOut } = useAuthActions();
  const profile = useQuery(api.profiles.me, {});
  const ensureProfile = useMutation(api.profiles.ensure);
  const chats = useQuery(api.chat.listInbox, {});
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (profile !== null) return;
    void ensureProfile({}).catch((error) => {
      setNotice(errorMessage(error));
    });
  }, [ensureProfile, profile]);

  const selectedChat = useMemo(
    () => chats?.find((chat) => chat.id === selected) ?? null,
    [chats, selected],
  );

  function openChat(chat: ChatSummary) {
    setSelected(chat.id);
    setNotice(null);
  }

  function createdChat(conversationId: string) {
    setSelected(conversationId);
    setNotice(null);
  }

  return (
    <div className="app-shell">
      <Sidebar
        chats={chats}
        loading={chats === undefined}
        notice={notice}
        onCreated={createdChat}
        onSelect={openChat}
        onSignOut={() => void signOut()}
        profile={profile ?? null}
        selected={selected}
      />
      <main className="thread-pane">
        {selectedChat ? (
          <Thread key={selectedChat.id} chat={selectedChat} />
        ) : (
          <EmptyThread />
        )}
      </main>
    </div>
  );
}

function EmptyThread() {
  return (
    <section className="empty-thread">
      <div className="empty-orbit">
        <span />
        <span />
        <span />
      </div>
      <p className="eyebrow">Second-user simulator</p>
      <h2>Pick a chat, or start one by username.</h2>
      <p>
        Sign in on your phone with the same deployment, then message this account
        from the phone. New messages appear here while the page is open.
      </p>
      <div className="empty-hint">
        <strong>Agent shortcut</strong>
        <code>npm run web:agent -- send --to &lt;username&gt; --text "hello"</code>
      </div>
    </section>
  );
}
