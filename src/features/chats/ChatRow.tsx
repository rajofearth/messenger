import React, { useRef } from "react";
import { Keyboard, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Chat } from "../../domain/data";
import { chatTimeLabel } from "../../domain/time";
import { Avatar } from "../../ui/primitives";
import { palette } from "../../ui/theme";
import { s } from "./ChatsScreen.styles";

type Props = {
  chat: Chat;
  dark: boolean;
  onOpen: (chat: Chat) => void;
  onActions: (chat: Chat, x?: number, y?: number) => void;
};

/** Memoized row so an open action menu does not re-render the whole list. */
function ChatRow({ chat, dark, onOpen, onActions }: Props) {
  const colors = palette(dark);
  const longPressed = useRef(false);
  const pending =
    chat.lastMessageStatus === "sending" || chat.lastMessageStatus === "failed";
  const failed = chat.lastMessageStatus === "failed";
  const preview =
    chat.lastMessageStatus === "sending"
      ? "Sending…"
      : chat.lastMessageStatus === "failed"
        ? "Not sent"
        : chat.preview;
  const confirmed =
    !pending &&
    (chat.lastMessageStatus === "sent" ||
      (!chat.lastMessageStatus && chat.preview.startsWith("You:")));
  // Server chats carry a timestamp; the cached `time` label is the fallback
  // for rows written before that field existed, or for a contact with no
  // messages yet.
  const timestamp = chatTimeLabel(chat.lastMessageAt) ?? chat.time;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${chat.name}, ${chat.unread > 0 ? `${chat.unread} unread messages, ` : ""}${preview}`}
      accessibilityHint="Long press or use conversation actions for more options"
      accessibilityActions={[
        { name: "longpress", label: `Conversation actions for ${chat.name}` },
      ]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName !== "longpress") return;
        Keyboard.dismiss();
        onActions(chat);
      }}
      onPressIn={() => {
        longPressed.current = false;
      }}
      onLongPress={(event) => {
        longPressed.current = true;
        Keyboard.dismiss();
        onActions(chat, event.nativeEvent.pageX, event.nativeEvent.pageY);
      }}
      onPress={() => {
        if (!longPressed.current) onOpen(chat);
      }}
      style={({ pressed }) => [
        s.chatRow,
        pressed && { backgroundColor: colors.card },
      ]}
    >
      <Avatar uri={chat.avatar} name={chat.name} />
      <View style={s.chatBody}>
        <View style={s.rowTop}>
          <Text numberOfLines={1} style={[s.name, { color: colors.fg }]}>
            {chat.name}
          </Text>
          <Text
            style={[s.time, { color: chat.unread > 0 ? colors.coralInk : colors.muted }]}
          >
            {timestamp}
          </Text>
        </View>
        <View style={s.rowBottom}>
          <Text
            numberOfLines={1}
            style={[
              s.preview,
              {
                color: failed
                  ? dark
                    ? "#FFB4AB"
                    : "#B3261E"
                  : chat.unread > 0
                    ? dark
                      ? "#D7DAD3"
                      : "#667268"
                    : colors.muted,
              },
            ]}
          >
            {preview}
          </Text>
          {chat.muted && (
            <Ionicons
              name="notifications-off-outline"
              size={14}
              color={colors.muted}
              accessibilityLabel="Muted"
            />
          )}
          {chat.pinned && (
            <Ionicons
              name="pin-outline"
              size={14}
              color={colors.muted}
              accessibilityLabel="Pinned"
            />
          )}
          {chat.unread > 0 && (
            <View style={s.unread}>
              <Text style={s.unreadText}>{chat.unread}</Text>
            </View>
          )}
          {chat.unread <= 0 && confirmed && (
            <Ionicons name="checkmark" color={colors.muted} size={15} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default React.memo(ChatRow);
