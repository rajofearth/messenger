import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import type { Message } from "../../domain/data";
import { groupMediaMessages, type MediaRow } from "../../domain/mediaAlbums";
import { daySeparatorLabel, localDayKey } from "../../domain/time";
import { palette } from "../../ui/theme";
import MessageRow from "./MessageRow";
import type { ActionTarget } from "./MessageActions";
import { styles as s } from "./ConversationScreen.styles";

export type ConversationListProps = {
  chatId: string;
  messages: Message[];
  dark: boolean;
  visible: boolean;
  typing: boolean;
  hasOlder: boolean;
  loadingOlder: boolean;
  /** The last "load older" failed; the control offers a retry. */
  loadOlderFailed?: boolean;
  onLoadOlder?: () => void;
  onScrollBeginDrag: () => void;
  onActions: (target: ActionTarget) => void;
  onReact: (messageId: string, emoji: string) => void;
  onViewMedia: (message: Message) => void;
  onOpenAlbum: (ids: string[], initialId: string) => void;
  onRetry: (messageId: string) => void;
};

/**
 * The message list owns its scroll position: it follows the newest row only
 * while the reader is pinned to the bottom, and asks for older pages when they
 * reach the top.
 */
export default function ConversationList({
  chatId,
  messages,
  dark,
  visible,
  typing,
  hasOlder,
  loadingOlder,
  loadOlderFailed = false,
  onLoadOlder,
  onScrollBeginDrag,
  onActions,
  onReact,
  onViewMedia,
  onOpenAlbum,
  onRetry,
}: ConversationListProps) {
  const { muted, card, coralInk } = palette(dark);
  const rows = useMemo(() => groupMediaMessages(messages), [messages]);
  // One label per row: the first row of a local day gets a chip, later rows on
  // the same day get none. A row without a timestamp never starts a day.
  const dayLabels = useMemo(() => {
    let previous: string | null = null;
    return rows.map((row) => {
      const first = row.type === "album" ? row.messages[0] : row.message;
      const key = localDayKey(first.createdAt);
      if (!key || key === previous) return null;
      previous = key;
      return daySeparatorLabel(first.createdAt);
    });
  }, [rows]);
  const list = useRef<FlatList<MediaRow>>(null);
  const pinned = useRef(true);
  // Only a new newest message moves the view. Keying on the length too would
  // treat a prepended page as "new message" and jump to the bottom.
  const tail = messages.length ? messages[messages.length - 1].id : "";
  // A page can only start from a confirmed row; an optimistic-only thread has
  // no cursor, so the control would be a dead end.
  const canLoadOlder =
    hasOlder &&
    rows.length > 0 &&
    messages.some((message) => message.sequence !== undefined);
  // A newly selected thread starts pinned; later content changes must not steal
  // the reader's place when they have scrolled up.
  useEffect(() => {
    pinned.current = true;
    list.current?.scrollToEnd({ animated: true });
  }, [chatId]);
  useEffect(() => {
    if (pinned.current) list.current?.scrollToEnd({ animated: true });
  }, [tail]);
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      pinned.current =
        contentSize.height - contentOffset.y - layoutMeasurement.height < 120;
      // The list is not inverted, so older rows sit above the viewport.
      if (hasOlder && !loadingOlder && contentOffset.y < 80) {
        // The reader is at the top on purpose; the page that arrives must not
        // pull them back to the newest row.
        pinned.current = false;
        onLoadOlder?.();
      }
    },
    [hasOlder, loadingOlder, onLoadOlder],
  );
  const loadOlder = useCallback(() => {
    // The header control prepends rows as well, so stop following the tail.
    pinned.current = false;
    onLoadOlder?.();
  }, [onLoadOlder]);
  // Rows report their height as they mount, so the tail is only chased while
  // the newest message is already on screen.
  const onContentSizeChange = useCallback(() => {
    if (pinned.current) list.current?.scrollToEnd({ animated: true });
  }, []);
  const keyExtractor = useCallback(
    (row: MediaRow) => (row.type === "album" ? row.id : row.message.id),
    [],
  );
  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<MediaRow>) => {
      const message = item.type === "album" ? item.messages[0] : item.message;
      const next = rows[index + 1];
      const nextMine =
        next?.type === "album" ? next.messages[0].mine : next?.message.mine;
      const content = (
        <MessageRow
          row={item}
          dark={dark}
          visible={visible}
          showTimestamp={index === rows.length - 1 || nextMine !== message.mine}
          onActions={onActions}
          onReact={onReact}
          onViewMedia={onViewMedia}
          onOpenAlbum={onOpenAlbum}
          onRetry={onRetry}
        />
      );
      const label = dayLabels[index];
      if (!label) return content;
      return (
        <View>
          <View style={s.dateChip}>
            <Text style={[s.tiny, { color: muted }]}>{label}</Text>
          </View>
          {content}
        </View>
      );
    },
    [
      rows,
      dark,
      visible,
      onActions,
      onReact,
      onViewMedia,
      onOpenAlbum,
      onRetry,
      dayLabels,
      muted,
    ],
  );
  return (
    <FlatList
      ref={list}
      style={s.root}
      data={rows}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      contentContainerStyle={s.messageList}
      keyboardShouldPersistTaps="handled"
      onScrollBeginDrag={onScrollBeginDrag}
      onScroll={onScroll}
      scrollEventThrottle={32}
      onContentSizeChange={onContentSizeChange}
      // Prepending an older page must not move the rows the reader sees.
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      initialNumToRender={12}
      maxToRenderPerBatch={8}
      windowSize={9}
      ListHeaderComponent={
        canLoadOlder ? (
          // Kept mounted so its busy state can be announced, and shown even on
          // a thread shorter than the viewport where the top-edge trigger
          // cannot fire.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              loadOlderFailed
                ? "Couldn't load older messages. Tap to retry."
                : "Load older messages"
            }
            accessibilityState={{ busy: loadingOlder }}
            disabled={loadingOlder}
            onPress={loadOlder}
          >
            <Text
              accessibilityLiveRegion="polite"
              style={[s.emptyThread, { color: loadingOlder ? muted : coralInk }]}
            >
              {loadingOlder
                ? "Loading older messages…"
                : loadOlderFailed
                  ? "Couldn't load older messages. Tap to retry."
                  : "Load older messages"}
            </Text>
          </Pressable>
        ) : null
      }
      ListEmptyComponent={
        <Text style={[s.emptyThread, { color: muted }]}>
          No messages yet. Say hello to start the conversation.
        </Text>
      }
      ListFooterComponent={
        typing ? (
          <View style={[s.typing, { backgroundColor: card }]}>
            <Text style={{ color: coralInk, letterSpacing: 5 }}>● ● ●</Text>
          </View>
        ) : null
      }
    />
  );
}
