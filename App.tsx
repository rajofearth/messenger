import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  StyleSheet,
  useColorScheme,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationBar } from "expo-navigation-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFonts } from "expo-font";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import ChatsScreen from "./src/features/chats/ChatsScreen";
import CallsScreen from "./src/features/calls/CallsScreen";
import ConversationScreen from "./src/features/conversations/ConversationScreen";
import SettingsScreen from "./src/features/profile/SettingsScreen";
import NewConversationScreen from "./src/features/contacts/NewConversationScreen";
import ContactEditor from "./src/features/contacts/ContactEditor";
import Stories from "./src/features/stories/Stories";
import Navigation from "./src/ui/Navigation";
import type { Tab } from "./src/ui/Navigation";
import CallFlow, { CallPill } from "./src/features/calls/CallFlow";
import { useMessenger } from "./src/state/useMessenger";
import { useCalls } from "./src/features/calls/useCalls";
import type { Chat, Message } from "./src/domain/data";
import { seedMessages } from "./src/domain/data";
import ChatProfile from "./src/features/contacts/ChatProfile";
import CallHistoryDetail from "./src/features/calls/CallHistoryDetail";
import ForwardScreen from "./src/features/conversations/ForwardScreen";
import { palette, coral } from "./src/ui/theme";
import { useSystemAppearance } from "./src/ui/useSystemAppearance";
import { useCallNotifications } from "./src/features/calls/useCallNotifications";
import { forgetIncomingCall, rememberIncomingCall } from "./src/features/calls/pendingCall";
import { useMessageNotifications } from "./src/notifications/useMessageNotifications";
import { useNotificationBridge } from "./src/notifications/useNotificationBridge";
import { useNotificationActions } from "./src/state/useNotificationActions";
import {
  isSystemNotificationsAvailable,
  setConversationMuted,
} from "./src/services/systemNotifications";

type ComposeMode = "message" | "voice" | "video";

export default function App() {
  const [fonts, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });
  const messenger = useMessenger();
  const calls = useCalls(messenger.addCall);
  const [tab, setTab] = useState<Tab>("chats");
  const [compose, setCompose] = useState<ComposeMode | null>(null);
  const [editor, setEditor] = useState<"contact" | "group" | null>(null);
  const [storyIndex, setStoryIndex] = useState<number | null>(null);
  const [addingStory, setAddingStory] = useState(false);
  const [recording, setRecording] = useState(false);
  const [detail, setDetail] = useState<{
    id: string;
    kind: "profile" | "history";
  } | null>(null);
  const [forward, setForward] = useState<Message | null>(null);
  const detailChat =
    messenger.chats.find((item) => item.id === detail?.id) ||
    messenger.history.find((item) => item.chat.id === detail?.id)?.chat;
  const colors = palette(messenger.dark);
  const systemDark = useColorScheme() === "dark";
  useSystemAppearance(messenger.theme, colors.bg);
  const chat = messenger.chats.find((item) => item.id === messenger.selected);

  useEffect(() => {
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (calls.full) {
        calls.setFull(false);
        return true;
      }
      if (forward) {
        setForward(null);
        return true;
      }
      if (detail) {
        setDetail(null);
        return true;
      }
      // The conversation handles its overlays and recording guard itself.
      if (messenger.selected) return false;
      if (compose) {
        setCompose(null);
        return true;
      }
      if (tab !== "chats") {
        setTab("chats");
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [calls.full, messenger.selected, compose, tab, detail, forward]);

  function openChat(contact: Chat) {
    setDetail(null);
    setForward(null);
    setCompose(null);
    setTab("chats");
    messenger.openChat(contact);
  }
  /**
   * System notifications are on unless the user turns them off; the native
   * module itself refuses to post when Android permission or a channel blocks it.
   */
  const notificationsEnabled =
    isSystemNotificationsAvailable &&
    messenger.profile.systemNotifications !== false;
  const onNotificationAction = useNotificationActions({
    messenger,
    calls,
    // The bridge keeps the newest handler in a ref, so identity churn is fine.
    openConversation: openChat,
  });
  useNotificationBridge(onNotificationAction, notificationsEnabled);
  useCallNotifications(calls.call, notificationsEnabled);
  useMessageNotifications({
    chats: messenger.chats,
    messages: messenger.messages,
    seed: seedMessages,
    self: {
      id: "self",
      name: messenger.profile.name,
      avatarUri: messenger.profile.avatar,
    },
    visibleChatId: messenger.selected,
    visible:
      !calls.full && !detail && !forward && storyIndex === null && !addingStory,
    previews: messenger.profile.previews !== false,
    sound: messenger.profile.sound !== false,
    enabled: notificationsEnabled,
  });
  /** Mute is stored in both places: the app preference and native suppression. */
  function muteChat(id: string, muted: boolean) {
    messenger.setMuted(id, muted);
    if (isSystemNotificationsAvailable)
      void setConversationMuted(id, muted).catch(() => {});
  }
  function startCall(contact: Chat, video: boolean, incoming = false) {
    if (!contact) {
      Alert.alert("No contacts", "Add a contact before trying a call.");
      return;
    }
    const currentContact =
      messenger.chats.find((item) => item.id === contact.id) || contact;
    if (currentContact.blocked) {
      Alert.alert(
        "Contact blocked",
        "Unblock this contact from their profile before calling.",
      );
      return;
    }
    if (recording) {
      Alert.alert(
        "Finish your voice note first",
        "Send or cancel the current recording before starting a call.",
      );
      return;
    }
    calls.start(currentContact, video, incoming);
  }
  /** Incoming calls keep a record so a notification answer can rebuild them. */
  function ringIncoming(contact: Chat, video: boolean) {
    startCall(contact, video, true);
  }
  /**
   * A ringing call is recorded so a notification answer can rebuild it. The
   * record is dropped as soon as the call stops ringing, otherwise a later
   * notification action would resurrect a call the user already answered, or
   * record a missed call that actually connected.
   */
  const ringing = useRef(false);
  useEffect(() => {
    if (!notificationsEnabled) return;
    if (calls.call?.status !== "incoming") {
      if (!ringing.current) return;
      ringing.current = false;
      void forgetIncomingCall();
      return;
    }
    if (ringing.current) return;
    ringing.current = true;
    void rememberIncomingCall({
      callId: calls.call.id,
      chatId: calls.call.chat.id,
      video: calls.call.video,
      receivedAt: Date.now(),
      timeoutMs: 60_000,
    });
  }, [notificationsEnabled, calls.call]);
  function openCall(answer = false) {
    if (recording) {
      Alert.alert(
        "Finish your voice note first",
        "Send or cancel the current recording before opening the call.",
      );
      return;
    }
    if (answer) calls.answer();
    else calls.setFull(true);
  }
  useEffect(() => {
    messenger.setConversationVisible(
      !calls.full && !detail && !forward && storyIndex === null && !addingStory,
    );
  }, [
    calls.full,
    messenger.selected,
    storyIndex,
    addingStory,
    detail,
    forward,
  ]);

  function selectContact(contact: Chat) {
    if (compose === "message") openChat(contact);
    else {
      startCall(contact, compose === "video");
      setCompose(null);
    }
  }
  const actions = {
    onNewConversation: () => setCompose("message"),
    onVoiceCall: () => setCompose("voice"),
    onVideoCall: () => setCompose("video"),
  };

  if ((!fonts && !fontError) || !messenger.loaded) {
    return (
      <View style={[s.loading, { backgroundColor: palette(systemDark).bg }]}>
        <Ionicons name="chatbubble-ellipses" size={42} color={coral} />
      </View>
    );
  }
  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.bg }}
        edges={calls.full ? [] : ["top", "bottom"]}
      >
        <StatusBar style={calls.full || messenger.dark ? "light" : "dark"} />
        {/* On Android the navigation bar buttons follow the same rule. */}
        <NavigationBar style={calls.full || messenger.dark ? "light" : "dark"} />
        {calls.call && (
          <View
            style={{ flex: 1, display: calls.full ? "flex" : "none" }}
            accessibilityElementsHidden={!calls.full}
            importantForAccessibility={
              calls.full ? "auto" : "no-hide-descendants"
            }
          >
            <CallFlow
              call={calls.call}
              onBack={() => calls.setFull(false)}
              onEnd={calls.end}
              onAnswer={calls.answer}
              onMuteChange={calls.setMuted}
              onSpeakerChange={calls.setSpeaker}
              onChat={() => {
                openChat(calls.call!.chat);
                calls.setFull(false);
              }}
            />
          </View>
        )}
        {!calls.full && detailChat && (
          <View style={{ flex: 1 }}>
            {detail?.kind === "history" ? (
              <CallHistoryDetail
                chat={detailChat}
                history={messenger.history}
                dark={messenger.dark}
                onBack={() => setDetail(null)}
                onProfile={() =>
                  setDetail({ id: detailChat.id, kind: "profile" })
                }
                onCall={(video) => startCall(detailChat, video)}
              />
            ) : (
              <ChatProfile
                chat={detailChat}
                chats={messenger.chats}
                messages={
                  messenger.messages[detailChat.id] || seedMessages(detailChat)
                }
                history={messenger.history}
                dark={messenger.dark}
                onBack={() => setDetail(null)}
                onCall={(video) => startCall(detailChat, video)}
                onMuteChange={(muted) => muteChat(detailChat.id, muted)}
                onBlockChange={(blocked) =>
                  messenger.setBlocked(detailChat.id, blocked)
                }
                onDeleteChat={() => {
                  messenger.deleteChat(detailChat.id);
                  setDetail(null);
                }}
                onClearHistory={() => messenger.clearChat(detailChat.id)}
                onOpenChat={openChat}
              />
            )}
          </View>
        )}
        {!calls.full && forward && (
          <ForwardScreen
            chats={messenger.chats}
            message={forward}
            dark={messenger.dark}
            onBack={() => setForward(null)}
            onForward={(ids) => {
              ids.forEach((id) => messenger.forwardMessage(forward, id));
              setForward(null);
            }}
          />
        )}
        <View
          style={{
            flex: 1,
            display: calls.full || detail || forward ? "none" : "flex",
          }}
          accessibilityElementsHidden={calls.full || !!detail || !!forward}
          importantForAccessibility={
            calls.full || detail || forward ? "no-hide-descendants" : "auto"
          }
        >
          {calls.call && (
            <CallPill
              call={calls.call}
              onOpen={() => openCall()}
              onAnswer={() => openCall(true)}
              onEnd={calls.end}
            />
          )}
          {chat ? (
            <ConversationScreen
              key={chat.id}
              visible={
                !calls.full &&
                !detail &&
                !forward &&
                storyIndex === null &&
                !addingStory
              }
              chat={chat}
              messages={messenger.messages[chat.id] || []}
              dark={messenger.dark}
              typing={messenger.typingIds.includes(chat.id)}
              onBack={messenger.closeChat}
              onCall={(video) => startCall(chat, video)}
              onSend={messenger.send}
              onReact={messenger.react}
              onRecordingChange={setRecording}
              onProfile={() => setDetail({ id: chat.id, kind: "profile" })}
              onDelete={messenger.deleteMessage}
              onForward={setForward}
            />
          ) : compose ? (
            <NewConversationScreen
              contacts={messenger.chats}
              dark={messenger.dark}
              mode={compose}
              onBack={() => setCompose(null)}
              onSelect={selectContact}
              onNewContact={() => setEditor("contact")}
              onNewGroup={() => setEditor("group")}
            />
          ) : tab === "settings" ? (
            <SettingsScreen
              dark={messenger.dark}
              theme={messenger.theme}
              onThemeChange={messenger.setTheme}
              onProfileChange={messenger.setProfile}
              onIncoming={() => ringIncoming(messenger.chats[0], true)}
            />
          ) : tab === "calls" ? (
            <CallsScreen
              history={messenger.history}
              dark={messenger.dark}
              onCall={startCall}
              onHistory={(contact) =>
                setDetail({ id: contact.id, kind: "history" })
              }
              {...actions}
            />
          ) : (
            <ChatsScreen
              chats={messenger.chats}
              stories={messenger.stories}
              avatar={messenger.profile.avatar}
              dark={messenger.dark}
              typingId={messenger.typingIds[0] || null}
              onOpenChat={openChat}
              onProfile={(contact) =>
                setDetail({ id: contact.id, kind: "profile" })
              }
              onToggleMute={(contact) =>
                muteChat(contact.id, !contact.muted)
              }
              onTogglePin={(contact) => messenger.togglePin(contact.id)}
              onDeleteChat={(contact) => messenger.deleteChat(contact.id)}
              onStory={setStoryIndex}
              onAddStory={() => setAddingStory(true)}
              {...actions}
            />
          )}
          {!chat && !compose && (
            <Navigation
              active={tab}
              avatar={messenger.profile.avatar}
              dark={messenger.dark}
              onChange={setTab}
            />
          )}
        </View>
        <ContactEditor
          kind={editor}
          dark={messenger.dark}
          onClose={() => setEditor(null)}
          onSave={(name, handle, group) => {
            const contact = messenger.addContact(name, handle, group);
            setEditor(null);
            if (group || compose === "message") openChat(contact);
          }}
        />
        <Stories
          stories={messenger.stories}
          index={storyIndex}
          avatar={messenger.profile.avatar}
          dark={messenger.dark}
          adding={addingStory}
          onClose={() => {
            setStoryIndex(null);
            setAddingStory(false);
          }}
          onSeen={messenger.markStorySeen}
          onDelete={messenger.deleteStory}
          onShare={messenger.shareStory}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
