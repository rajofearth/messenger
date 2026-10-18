import React, { useEffect, useState } from "react";
import { Alert, BackHandler, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
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
import type { Chat } from "./src/domain/data";
import { palette, coral } from "./src/ui/theme";

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
  const colors = palette(messenger.dark);
  const chat = messenger.chats.find((item) => item.id === messenger.selected);

  useEffect(() => {
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (calls.full) {
        calls.setFull(false);
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
  }, [calls.full, messenger.selected, compose, tab]);

  function openChat(contact: Chat) {
    setCompose(null);
    setTab("chats");
    messenger.openChat(contact);
  }
  function startCall(contact: Chat, video: boolean, incoming = false) {
    if (recording) {
      Alert.alert(
        "Finish your voice note first",
        "Send or cancel the current recording before starting a call.",
      );
      return;
    }
    calls.start(contact, video, incoming);
  }
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
      !calls.full && storyIndex === null && !addingStory,
    );
  }, [calls.full, messenger.selected, storyIndex, addingStory]);

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
      <View style={s.loading}>
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
              onChat={() => {
                openChat(calls.call!.chat);
                calls.setFull(false);
              }}
            />
          </View>
        )}
        <View
          style={{ flex: 1, display: calls.full ? "none" : "flex" }}
          accessibilityElementsHidden={calls.full}
          importantForAccessibility={
            calls.full ? "no-hide-descendants" : "auto"
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
              chat={chat}
              messages={messenger.messages[chat.id] || []}
              dark={messenger.dark}
              typing={messenger.typingIds.includes(chat.id)}
              onBack={messenger.closeChat}
              onCall={(video) => startCall(chat, video)}
              onSend={messenger.send}
              onReact={messenger.react}
              onRecordingChange={setRecording}
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
              onDarkChange={messenger.setDark}
              onProfileChange={messenger.setProfile}
              onIncoming={() => startCall(messenger.chats[0], true, true)}
            />
          ) : tab === "calls" ? (
            <CallsScreen
              history={messenger.history}
              dark={messenger.dark}
              onCall={startCall}
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
    backgroundColor: "#FBFAF7",
  },
});
