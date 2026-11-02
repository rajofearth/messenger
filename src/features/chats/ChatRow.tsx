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

type ChatPresence = Chat & {
  /** Optional fields are accepted for backends that expose live presence. */
  online?: boolean;
  isOnline?: boolean;
  presence?: boolean | "online" | "offline";
};

function GroupAvatar({ dark }: { dark: boolean }) {
  const colors = palette(dark);
  return (
    <View
      accessible={false}
      style={[s.groupAvatar, { backgroundColor: colors.input }]}
    >
      {[0, 1, 2, 3].map((index) => (
        <View
          key={index}
          accessible={false}
          style={[s.groupAvatarCell, { backgroundColor: colors.card }]}
        >
          <Ionicons name="person" size={10} color={colors.muted} />
        </View>
      ))}
    </View>
  );
}

/** Memoized row so an open action menu does not re-render the whole list. */
function ChatRow({ chat, dark, onOpen, onActions }: Props) {
  const colors = palette(dark);
  const presence = chat as ChatPresence;
  const online =
    presence.online === true ||
    presence.isOnline === true ||
    presence.presence === true ||
    presence.presence === "online";
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
  // A relay drain can surface a conversation before the inbox query has named
  // it; the preview and unread badge are still worth showing.
  const name = chat.name || "Conversation";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${chat.unread > 0 ? `${chat.unread} unread messages, ` : ""}${preview}`}
      accessibilityHint="Long press or use conversation actions for more options"
      accessibilityActions={[
        { name: "longpress", label: `Conversation actions for ${name}` },
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
        pressed && { backgroundColor: colors.input },
      ]}
    >
      <View style={s.avatarWrap}>
        {chat.group ? (
          <GroupAvatar dark={dark} />
        ) : (
          <Avatar uri={chat.avatar} name={name} size={56} dark={dark} />
        )}
        {online && (
          <View
            accessible={false}
            style={[
              s.presence,
              { backgroundColor: colors.online, borderColor: colors.bg },
            ]}
          />
        )}
      </View>
      <View style={s.chatBody}>
        <View style={s.rowTop}>
          <View style={s.nameLine}>
            <Text
              numberOfLines={1}
              style={[s.name, chat.unread > 0 && s.unreadName, { color: colors.fg }]}
            >
              {name}
            </Text>
            {chat.unread > 0 && (
              <View
                accessible={false}
                style={[s.unreadDot, { backgroundColor: colors.unread }]}
              />
            )}
          </View>
          <Text
            style={[
              s.time,
              { color: colors.muted },
            ]}
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
                  ? colors.danger
                  : chat.unread > 0
                    ? colors.fg
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
          {chat.unread <= 0 && confirmed && (
            <Ionicons name="checkmark" color={colors.muted} size={15} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default React.memo(ChatRow);
