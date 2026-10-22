import React, { useCallback } from "react";
import type { Message } from "../../domain/data";
import type { MediaRow } from "../../domain/mediaAlbums";
import type { ActionTarget } from "./MessageActions";
import MessageBubble from "./MessageBubble";
import MediaAlbum from "./MediaAlbum";

type Props = {
  row: MediaRow;
  dark: boolean;
  visible: boolean;
  showTimestamp: boolean;
  onActions: (target: ActionTarget) => void;
  onReact: (messageId: string, emoji: string) => void;
  onViewMedia: (message: Message) => void;
  onOpenAlbum: (ids: string[], initialId: string) => void;
  onRetry: (messageId: string) => void;
};

/** Memoized list row: either a message bubble or a grouped media album. */
function MessageRow({
  row,
  dark,
  visible,
  showTimestamp,
  onActions,
  onReact,
  onViewMedia,
  onOpenAlbum,
  onRetry,
}: Props) {
  const openAlbum = useCallback(
    (selected: Message) =>
      onOpenAlbum(
        row.type === "album" ? row.messages.map((item) => item.id) : [],
        selected.id,
      ),
    [row, onOpenAlbum],
  );
  return row.type === "album" ? (
    <MediaAlbum
      messages={row.messages}
      dark={dark}
      visible={visible}
      showTimestamp={showTimestamp}
      onActions={onActions}
      onReact={onReact}
      onViewMedia={openAlbum}
      onRetry={onRetry}
    />
  ) : (
    <MessageBubble
      message={row.message}
      dark={dark}
      visible={visible}
      showTimestamp={showTimestamp}
      onActions={onActions}
      onReact={onReact}
      onViewMedia={onViewMedia}
      onRetry={onRetry}
    />
  );
}

export default React.memo(MessageRow);
