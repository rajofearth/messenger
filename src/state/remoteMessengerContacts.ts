import type { Chat } from "../domain/data";
import {
  chatFromConversation,
  type RemoteConversation,
} from "./conversationSync";

type DirectArgs = { username: string };
type GroupArgs = { title: string; usernames: string[] };

/** Group members are typed as a comma or space separated list of usernames. */
function usernamesOf(handle: string): string[] {
  return handle
    .split(/[\s,]+/)
    .map((entry) => entry.trim().replace(/^@/, ""))
    .filter(Boolean);
}

/**
 * Converts the editor fields into a new conversation and returns the chat row
 * the UI can open immediately, before the conversation query refreshes.
 */
export async function createRemoteContact(
  input: { name: string; handle: string; group: boolean },
  actions: {
    createDirect: (args: DirectArgs) => Promise<RemoteConversation>;
    createGroup: (args: GroupArgs) => Promise<RemoteConversation>;
    selfId?: string;
  },
): Promise<Chat> {
  const { name, handle, group } = input;
  const view = group
    ? await actions.createGroup({
        title: name,
        usernames: usernamesOf(handle),
      })
    : await actions.createDirect({
        username: handle.trim().replace(/^@/, ""),
      });
  return chatFromConversation(view, undefined, undefined, actions.selfId);
}
