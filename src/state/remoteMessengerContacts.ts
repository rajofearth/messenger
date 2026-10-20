import type { Chat } from "../domain/data";
import { timeLabel } from "./remoteMessengerTypes";

type DirectArgs = { username: string };
type GroupArgs = { title: string; usernames: string[] };
type DirectResult = {
  id: string;
  target: {
    name: string;
    avatar?: string | null;
    username?: string;
    bio?: string;
  } | null;
};

/**
 * Converts the editor fields into a new conversation and returns the chat row
 * the UI can open immediately, before the inbox query refreshes.
 */
export async function createRemoteContact(
  input: { name: string; handle: string; group: boolean },
  actions: {
    createDirect: (args: DirectArgs) => Promise<DirectResult>;
    createGroup: (args: GroupArgs) => Promise<{ id: string }>;
    selfId?: string;
  },
): Promise<Chat> {
  const { name, handle, group } = input;
  if (group) {
    const usernames = handle
      .split(/[\s,]+/)
      .map((entry) => entry.trim().replace(/^@/, ""))
      .filter(Boolean);
    const result = await actions.createGroup({ title: name, usernames });
    return {
      id: result.id,
      name,
      avatar: "",
      preview: "Group created",
      time: timeLabel(),
      unread: 0,
      group: true,
      memberIds: [],
      adminIds: [actions.selfId || ""],
      color: "#F4E4D9",
    };
  }
  const result = await actions.createDirect({ username: handle });
  const target = result.target;
  if (!target) throw new Error("Contact not found");
  return {
    id: result.id,
    name: target.name,
    avatar: target.avatar || "",
    username: target.username,
    bio: target.bio,
    preview: "Start a conversation",
    time: "",
    unread: 0,
    online: false,
    color: "#EBEEE4",
    createdAt: new Date().toISOString(),
  };
}
