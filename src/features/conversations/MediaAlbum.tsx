import React, { useRef } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Message } from "../../domain/data";
import { albumOverflowCount } from "../../domain/mediaAlbums";
import { palette } from "../../ui/theme";
import { tap } from "../../ui/primitives";
import { ResponsiveImage } from "../../ui/ResponsiveImage";
import type { MessageBubbleProps } from "./MessageBubble";

type ItemProps = Pick<MessageBubbleProps, "message" | "onActions" | "visible"> & {
  onOpen: () => void;
  label: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/** Shared gestures keep each album item independently actionable, including in the viewer. */
export function AlbumItem({ message, onActions, visible = true, onOpen, label, style, children }: ItemProps) {
  const target = useRef<View>(null);
  const longPressed = useRef(false);
  const active = useRef(visible);
  active.current = visible && !message.deleted;
  function actions() {
    longPressed.current = true;
    if (!active.current) return;
    target.current?.measureInWindow((x, y, width, height) => {
      if (!active.current) return;
      tap();
      onActions({ message, rect: { x, y, width, height } });
    });
  }
  return (
    <Pressable
      ref={target}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Double tap to open. Long press for message actions."
      accessibilityActions={[{ name: "longpress", label: "Message actions" }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === "longpress") actions();
      }}
      onPressIn={() => { longPressed.current = false; }}
      onLongPress={actions}
      delayLongPress={300}
      onPress={() => {
        if (!active.current || longPressed.current) return;
        onOpen();
      }}
    >
      {children}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Message actions for ${message.kind === "video" ? "video" : "photo"}`}
        onPress={actions}
        hitSlop={6}
        style={s.menu}
      >
        <Ionicons name="ellipsis-horizontal" size={20} color="white" />
      </Pressable>
    </Pressable>
  );
}

type Props = Omit<MessageBubbleProps, "message"> & { messages: Message[] };
export default function MediaAlbum({ messages, dark, showTimestamp, visible = true, onActions, onViewMedia }: Props) {
  const first = messages[0];
  const last = messages[messages.length - 1];
  const { card, coralInk, fg, muted, outgoingFg, outgoingMuted } =
    palette(dark);
  const overflow = albumOverflowCount(messages.length);
  return (
    <View style={[s.row, first.mine && { alignItems: "flex-end" }]}>
      <View style={[s.album, { backgroundColor: first.mine ? (dark ? "#B86B57" : "#F4A18B") : card }]}>
        {first.replyTo && (
          <View style={[s.reply, { borderLeftColor: first.mine ? outgoingMuted : coralInk }]}>
            <Text style={{ color: first.mine ? outgoingMuted : muted }}>{first.replyTo.mine ? "You" : "Reply"}</Text>
            <Text numberOfLines={2} style={{ color: first.mine ? outgoingFg : fg }}>{first.replyTo.text}</Text>
          </View>
        )}
        <View style={s.grid}>
          {messages.slice(0, 4).map((message, index) => (
            <AlbumItem
              key={message.id}
              message={message}
              visible={visible}
              onActions={onActions}
              onOpen={() => onViewMedia(message)}
              label={index === 3 && overflow
                ? `${overflow} more ${messages.some((item) => item.kind === "video") ? "media items" : "photos"}`
                : `${message.kind === "video" ? "Video" : "Photo"} ${index + 1} of ${messages.length}`}
              style={[s.tile, messages.length === 3 && index === 2 && { width: "100%", aspectRatio: 2 }]}
            >
              {message.kind === "image" ? (
                <ResponsiveImage
                  uri={message.uri}
                  variants={message.variants}
                  sourceWidth={message.width}
                  previewUri={message.previewUri}
                  previewWidth={message.previewWidth}
                  // The third tile in a three-item album spans the full width.
                  displayWidth={messages.length === 3 && index === 2 ? 340 : 180}
                  recyclingKey={message.id}
                  contentFit="cover"
                  style={StyleSheet.absoluteFill}
                />
              ) : <Ionicons name="play-circle" size={44} color="white" />}
              {!!message.text && <Text numberOfLines={2} style={s.caption}>{message.text}</Text>}
              {!!message.reaction && <Text style={s.reaction}>{message.reaction}</Text>}
              {index === 3 && overflow > 0 && (
                <View pointerEvents="none" style={s.overflow}><Text style={s.count}>+{overflow}</Text></View>
              )}
            </AlbumItem>
          ))}
        </View>
      </View>
      {showTimestamp && (
        <View style={s.meta}>
          <Text style={{ color: muted, fontSize: 11 }}>{last.time}</Text>
          {last.mine && <Ionicons name="checkmark" size={15} color={coralInk} />}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: { alignItems: "flex-start", marginBottom: 10 },
  album: { width: "82%", maxWidth: 340, borderRadius: 18, padding: 4, overflow: "hidden" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  tile: { width: "49%", flexGrow: 1, aspectRatio: 1, backgroundColor: "#292C29", borderRadius: 6, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  menu: { position: "absolute", top: 6, right: 6, backgroundColor: "#00000088", borderRadius: 12, paddingHorizontal: 5, paddingVertical: 2, zIndex: 2 },
  overflow: { ...StyleSheet.absoluteFill, backgroundColor: "#00000088", justifyContent: "center", alignItems: "center" },
  count: { color: "white", fontSize: 32, fontWeight: "600" },
  caption: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 5, color: "white", backgroundColor: "#00000088", fontSize: 12 },
  reaction: { position: "absolute", bottom: 4, right: 4, backgroundColor: "white", borderRadius: 12, padding: 2 },
  reply: { borderLeftWidth: 3, padding: 8, marginBottom: 4 },
  meta: { flexDirection: "row", gap: 4, marginTop: 5 },
});
