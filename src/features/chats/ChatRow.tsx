import React, { useRef } from "react";
import { Keyboard, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Chat } from "../../domain/data";
import { Avatar } from "../../ui/primitives";
import { coral, palette } from "../../ui/theme";
import { s } from "./ChatsScreen.styles";

type Props = {
  chat: Chat;
  dark: boolean;
  typing: boolean;
  onOpen: (chat: Chat) => void;
  onActions: (chat: Chat, x: number, y: number) => void;
};

/** Memoized row so typing or an open action menu does not re-render the whole list. */
function ChatRow({ chat, dark, typing, onOpen, onActions }: Props) {
  const colors = palette(dark);
  const longPressed = useRef(false);
  const preview = typing ? "typing •••" : chat.preview;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${chat.name}, ${chat.unread > 0 ? `${chat.unread} unread messages, ` : ""}${preview}`}
      accessibilityHint="Long press for conversation actions"
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
      <Avatar uri={chat.avatar} online={chat.online} />
      <View style={s.chatBody}>
        <View style={s.rowTop}>
          <Text numberOfLines={1} style={[s.name, { color: colors.fg }]}>
            {chat.name}
          </Text>
          <Text
            style={[s.time, { color: chat.unread > 0 ? coral : colors.muted }]}
          >
            {chat.time}
          </Text>
        </View>
        <View style={s.rowBottom}>
          <Text
            numberOfLines={1}
            style={[
              s.preview,
              {
                color: typing
                  ? coral
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
          {chat.unread <= 0 && !typing && chat.preview.startsWith("You:") && (
            <Ionicons name="checkmark-done" color={colors.muted} size={15} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default React.memo(ChatRow);
