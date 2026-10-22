import React from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Chat, Message } from "../../domain/data";
import type { RemoteCallRecord } from "../../state/remoteMessengerTypes";
import { Avatar, IconButton, type IconName } from "../../ui/primitives";
import { coral, palette } from "../../ui/theme";
import {
  CallHistoryActions,
  CallHistoryList,
} from "../calls/CallHistoryDetail";
import ChatProfileShared from "./ChatProfileShared";
import { profileDate, profileMembership } from "./ChatProfileMetadata";

export type ChatProfileProps = {
  chat: Chat;
  chats: Chat[];
  messages: Message[];
  history: RemoteCallRecord[];
  dark: boolean;
  onBack: () => void;
  onCall: (video: boolean) => void;
  onMuteChange: (muted: boolean) => void;
  onBlockChange: (blocked: boolean) => void;
  onMediaVisibilityChange?: (gallery: boolean) => void;
  onDeleteChat: () => void;
  onClearHistory: () => void;
  onOpenChat: (chat: Chat) => void;
};

export default function ChatProfile({
  chat,
  chats,
  messages,
  history,
  dark,
  onBack,
  onCall,
  onMuteChange,
  onBlockChange,
  onMediaVisibilityChange,
  onDeleteChat,
  onClearHistory,
  onOpenChat,
}: ChatProfileProps) {
  const colors = palette(dark);
  const date = profileDate(chat, chat.group ? [] : messages);
  const membership = profileMembership(chat);
  const mutualGroups = chats.filter(
    (group) =>
      group.group &&
      group.id !== chat.id &&
      profileMembership(group).ids.includes(chat.id),
  );
  const knownContacts = new Map(
    chats
      .filter((contact) => !contact.group)
      .map((contact) => [contact.id, contact]),
  );
  function confirm(
    title: string,
    message: string,
    label: string,
    action: () => void,
  ) {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: label, style: "destructive", onPress: action },
    ]);
  }
  function actionRow(
    icon: IconName,
    title: string,
    status: string,
    onPress: () => void,
    destructive = false,
  ) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${status}`}
        onPress={onPress}
        style={[s.row, { borderBottomColor: colors.line }]}
      >
        <Ionicons
          name={icon}
          size={23}
          color={
            destructive
              ? dark
                ? "#FFB4AB"
                : "#B3261E"
              : colors.coralInk
          }
        />
        <View style={s.body}>
          <Text
            style={[
              s.label,
              {
                color: destructive
                  ? dark
                    ? "#FFB4AB"
                    : "#B3261E"
                  : colors.fg,
              },
            ]}
          >
            {title}
          </Text>
          <Text style={[s.caption, { color: colors.muted }]}>{status}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    );
  }
  /** Settings rows whose state is a switch, matching the platform control. */
  function toggleRow(
    icon: IconName,
    title: string,
    status: string,
    value: boolean,
    change: (next: boolean) => void,
    disabled = false,
  ) {
    return (
      <View style={[s.row, { borderBottomColor: colors.line }]}>
        <Ionicons name={icon} size={23} color={colors.coralInk} />
        <View style={s.body}>
          <Text style={[s.label, { color: colors.fg }]}>{title}</Text>
          <Text style={[s.caption, { color: colors.muted }]}>{status}</Text>
        </View>
        <Switch
          accessibilityLabel={title}
          value={value}
          onValueChange={change}
          disabled={disabled}
          trackColor={{ false: dark ? "#50574E" : "#DEDFD5", true: coral }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={dark ? "#50574E" : "#DEDFD5"}
        />
      </View>
    );
  }
  return (
    <View style={[s.screen, { backgroundColor: colors.bg }]}>
      <View style={s.header}>
        <IconButton
          name="arrow-back"
          label="Back"
          onPress={onBack}
          color={colors.fg}
        />
        <Text style={[s.heading, { color: colors.fg }]}>
          {chat.group ? "Group details" : "Contact details"}
        </Text>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.hero}>
          <Avatar
            uri={chat.avatar}
            name={chat.name}
            size={112}
            online={!chat.group && chat.online}
          />
          <Text style={[s.name, { color: colors.fg }]}>{chat.name}</Text>
          {!!chat.username && (
            <Text style={[s.label, { color: colors.coralInk }]}>
              @{chat.username.replace(/^@/, "")}
            </Text>
          )}
          {!chat.group && (
            <Text style={[s.caption, { color: colors.muted }]}>
              {chat.online
                ? "Online"
                : chat.online === false
                  ? "Offline"
                  : "Contact"}
            </Text>
          )}
          {!!chat.pinned && (
            <Text style={[s.caption, { color: colors.muted }]}>
              Pinned conversation
            </Text>
          )}
        </View>
        {chat.group ? (
          <Text style={[s.note, { color: colors.muted }]}>
            Group voice and video calls are unavailable. Start a one-to-one call
            from a member's profile instead.
          </Text>
        ) : (
          <CallHistoryActions dark={dark} onCall={onCall} />
        )}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.heading, { color: colors.fg }]}>
            {chat.group ? "Description" : "About"}
          </Text>
          <Text
            style={[
              s.description,
              { color: chat.bio ? colors.fg : colors.muted },
            ]}
          >
            {chat.bio ||
              (chat.group ? "No group description added." : "No bio added.")}
          </Text>
          <Text style={[s.caption, { color: colors.muted }]}>
            {chat.group ? "Created" : "Talking since"} {date.label}
            {date.seeded ? " · Demo date" : ""}
          </Text>
        </View>
        {chat.group ? (
          <View style={s.section}>
            <Text style={[s.heading, { color: colors.fg }]}>
              Members · {membership.ids.length}
            </Text>
            {membership.mock && (
              <Text style={[s.caption, { color: colors.muted }]}>
                Demo membership and admin labels
              </Text>
            )}
            {!membership.ids.length && (
              <Text style={[s.empty, { color: colors.muted }]}>
                {chat.memberIds
                  ? "No members listed."
                  : "Member information is unavailable."}
              </Text>
            )}
            {membership.ids.map((id) => {
              const member = knownContacts.get(id);
              const admin = membership.admins.includes(id);
              return member ? (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${member.name}${admin ? ", admin" : ""}`}
                  onPress={() => onOpenChat(member)}
                  style={[s.row, { borderBottomColor: colors.line }]}
                >
                  <Avatar uri={member.avatar} name={member.name} size={42} />
                  <Text style={[s.label, s.body, { color: colors.fg }]}>
                    {member.name}
                  </Text>
                  {admin && (
                    <Text
                      style={[
                        s.badge,
                        { color: colors.coralInk, backgroundColor: colors.tint },
                      ]}
                    >
                      Admin
                    </Text>
                  )}
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.muted}
                  />
                </Pressable>
              ) : (
                <View
                  key={id}
                  style={[s.row, { borderBottomColor: colors.line }]}
                >
                  <Ionicons
                    name="person-circle-outline"
                    size={42}
                    color={colors.muted}
                  />
                  <Text style={[s.label, s.body, { color: colors.muted }]}>
                    {id === "self" ? "You" : `Member ${id}`}
                  </Text>
                  {admin && (
                    <Text
                      style={[
                        s.badge,
                        { color: colors.coralInk, backgroundColor: colors.tint },
                      ]}
                    >
                      Admin
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={s.section}>
            <Text style={[s.heading, { color: colors.fg }]}>
              Groups in common · {mutualGroups.length}
            </Text>
            {!mutualGroups.length && (
              <Text style={[s.empty, { color: colors.muted }]}>
                No shared groups in the available membership data.
              </Text>
            )}
            {mutualGroups.map((group) => (
              <Pressable
                key={group.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${group.name}`}
                onPress={() => onOpenChat(group)}
                style={[s.row, { borderBottomColor: colors.line }]}
              >
                <Avatar uri={group.avatar} name={group.name} size={42} />
                <View style={s.body}>
                  <Text style={[s.label, { color: colors.fg }]}>
                    {group.name}
                  </Text>
                  <Text style={[s.caption, { color: colors.muted }]}>
                    {profileMembership(group).mock
                      ? "Demo membership"
                      : "Shared group"}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.muted}
                />
              </Pressable>
            ))}
          </View>
        )}
        <ChatProfileShared key={chat.id} messages={messages} dark={dark} />
        {!chat.group && (
          <View style={s.section}>
            <Text style={[s.heading, { color: colors.fg }]}>Call history</Text>
            <CallHistoryList
              chat={chat}
              history={history}
              dark={dark}
              onCall={onCall}
            />
          </View>
        )}
        <View style={s.section}>
          <Text style={[s.heading, { color: colors.fg }]}>
            Conversation settings
          </Text>
          {toggleRow(
            "notifications-off-outline",
            "Mute notifications",
            chat.muted
              ? "Muted · no system notifications"
              : "Notifications on",
            !!chat.muted,
            onMuteChange,
          )}
          {toggleRow(
            "images-outline",
            "Save media to gallery",
            chat.mediaVisibility === "gallery"
              ? "Received photos and videos are copied to the Messenger album"
              : "Media stays inside Messenger only",
            chat.mediaVisibility === "gallery",
            (value) => onMediaVisibilityChange?.(value),
            !onMediaVisibilityChange,
          )}
          {toggleRow(
            "ban-outline",
            "Block contact",
            chat.blocked ? "Blocked" : "Not blocked",
            !!chat.blocked,
            onBlockChange,
          )}
          {actionRow(
            "trash-outline",
            "Clear messages",
            "Remove all messages in this conversation",
            () =>
              confirm(
                "Clear messages?",
                `Remove all messages in your conversation with ${chat.name}? This cannot be undone.`,
                "Clear messages",
                onClearHistory,
              ),
            true,
          )}
          {actionRow(
            "close-circle-outline",
            "Delete chat",
            "Remove this conversation",
            () =>
              confirm(
                "Delete chat?",
                `Delete your conversation with ${chat.name}? This cannot be undone.`,
                "Delete chat",
                onDeleteChat,
              ),
            true,
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16 },
  heading: { fontFamily: "DMSans_700Bold", fontSize: 20 },
  content: { paddingHorizontal: 24, paddingBottom: 70 },
  hero: { alignItems: "center", gap: 10, paddingTop: 16 },
  name: {
    fontFamily: "DMSans_700Bold",
    fontSize: 28,
    textAlign: "center",
    marginTop: 8,
  },
  label: { fontFamily: "DMSans_500Medium", fontSize: 14 },
  caption: { fontFamily: "DMSans_400Regular", fontSize: 12, marginTop: 5 },
  note: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 14,
    marginHorizontal: 4,
  },
  description: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    lineHeight: 23,
    marginVertical: 12,
  },
  card: { padding: 20, borderRadius: 20 },
  section: { marginTop: 28 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1 },
  badge: {
    fontFamily: "DMSans_500Medium",
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  empty: {
    fontFamily: "DMSans_400Regular",
    paddingVertical: 20,
    lineHeight: 21,
  },
});
