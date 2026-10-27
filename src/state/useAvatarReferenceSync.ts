import { useEffect } from "react";
import { syncAvatarReferences } from "../data/avatars";

type AvatarHolder = { id: string; avatar?: string };
type HistoryHolder = { id: string; chat: { avatar?: string } };

/**
 * Keeps the avatar cache tied to the profiles the app still shows, so a
 * replaced or removed photo releases its download instead of lingering.
 */
export function useAvatarReferenceSync(input: {
  chats: readonly AvatarHolder[];
  stories: readonly AvatarHolder[];
  history: readonly HistoryHolder[];
  selfAvatar?: string;
}) {
  const { chats, stories, history, selfAvatar } = input;
  useEffect(() => {
    syncAvatarReferences(
      "chats",
      chats.map((chat) => ({ id: chat.id, uri: chat.avatar })),
    );
  }, [chats]);

  useEffect(() => {
    syncAvatarReferences(
      "stories",
      stories.map((story) => ({ id: story.id, uri: story.avatar })),
    );
  }, [stories]);

  useEffect(() => {
    syncAvatarReferences(
      "history",
      history.map((record) => ({ id: record.id, uri: record.chat.avatar })),
    );
  }, [history]);

  useEffect(() => {
    syncAvatarReferences("self", [{ id: "self", uri: selfAvatar }]);
  }, [selfAvatar]);
}
