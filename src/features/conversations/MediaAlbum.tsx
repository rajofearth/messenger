import React, { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import type { Message } from "../../domain/data";
import { albumOverflowCount } from "../../domain/mediaAlbums";
import { palette, coral } from "../../ui/theme";
import { tap } from "../../ui/primitives";
import type { MessageBubbleProps } from "./MessageBubble";

type ItemProps = Pick<MessageBubbleProps, "message" | "onActions" | "onReact" | "visible"> & {
  onOpen: () => void;
  label: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/** Shared gestures keep each album item independently actionable, including in the viewer. */
export function AlbumItem({ message, onActions, onReact, visible = true, onOpen, label, style, children }: ItemProps) {
  const target = useRef<View>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const active = useRef(visible);
  active.current = visible && !message.deleted;
  function cancelTap() {
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
  }
  useEffect(() => { if (!visible) cancelTap(); }, [visible]);
  useEffect(() => cancelTap, []);
  function actions() {
    cancelTap();
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
      accessibilityHint="Double tap quickly to react. Long press for message actions."
      accessibilityActions={[{ name: "longpress", label: "Message actions" }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === "longpress") actions();
      }}
      onPressIn={() => { longPressed.current = false; }}
      onLongPress={actions}
      delayLongPress={300}
      onPress={() => {
        if (!active.current || longPressed.current) return;
        if (pending.current) {
          cancelTap();
          tap();
          onReact(message.id, "🤍");
        } else pending.current = setTimeout(() => {
          pending.current = null;
          if (active.current) onOpen();
        }, 260);
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
export default function MediaAlbum({ messages, dark, showTimestamp, visible = true, onActions, onReact, onViewMedia }: Props) {
  const first = messages[0];
  const last = messages[messages.length - 1];
  const { card, fg, muted } = palette(dark);
  const overflow = albumOverflowCount(messages.length);
  return (
    <View style={[s.row, first.mine && { alignItems: "flex-end" }]}>
      <View style={[s.album, { backgroundColor: first.mine ? (dark ? "#B86B57" : "#F4A18B") : card }]}>
        {first.replyTo && (
          <View style={s.reply}>
            <Text style={{ color: first.mine ? "white" : muted }}>{first.replyTo.mine ? "You" : "Reply"}</Text>
            <Text numberOfLines={2} style={{ color: first.mine ? "white" : fg }}>{first.replyTo.text}</Text>
          </View>
        )}
        <View style={s.grid}>
          {messages.slice(0, 4).map((message, index) => (
            <AlbumItem
              key={message.id}
              message={message}
              visible={visible}
              onActions={onActions}
              onReact={onReact}
              onOpen={() => onViewMedia(message)}
              label={index === 3 && overflow
                ? `${overflow} more ${messages.some((item) => item.kind === "video") ? "media items" : "photos"}`
                : `${message.kind === "video" ? "Video" : "Photo"} ${index + 1} of ${messages.length}`}
              style={[s.tile, messages.length === 3 && index === 2 && { width: "100%", aspectRatio: 2 }]}
            >
              {message.kind === "image" ? (
                <Image source={{ uri: message.uri }} contentFit="cover" style={StyleSheet.absoluteFill} />
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
          {last.mine && <Ionicons name="checkmark-done" size={14} color={coral} />}
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
  reply: { borderLeftWidth: 3, borderLeftColor: coral, padding: 8, marginBottom: 4 },
  meta: { flexDirection: "row", gap: 4, marginTop: 5 },
});
