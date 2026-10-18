import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Chat, Message } from "../../domain/data";
import { formatDuration } from "../../domain/model";
import { Avatar, IconButton, tap } from "../../ui/primitives";
import { coral, palette } from "../../ui/theme";
import AttachmentMenu from "./AttachmentMenu";
import MessageBubble from "./MessageBubble";
import { useMessageMedia } from "./useMessageMedia";
import { styles as s } from "./ConversationScreen.styles";

export type ConversationScreenProps = {
  chat: Chat;
  messages: Message[];
  dark: boolean;
  typing: boolean;
  onBack: () => void;
  onCall: (video: boolean) => void;
  onSend: (message: Partial<Message>) => void;
  onReact: (messageId: string, emoji: string) => void;
  onRecordingChange: (recording: boolean) => void;
};

export default function ConversationScreen({
  chat,
  messages,
  dark,
  typing,
  onBack,
  onCall,
  onSend,
  onReact,
  onRecordingChange,
}: ConversationScreenProps) {
  const { bg, fg, muted, card, line } = palette(dark);
  const [draft, setDraft] = useState("");
  const [sheet, setSheet] = useState<"attach" | "emoji" | null>(null);
  const [reaction, setReaction] = useState<string | null>(null);
  const [imageView, setImageView] = useState<string | null>(null);
  const list = useRef<ScrollView>(null);
  const media = useMessageMedia(onSend);
  const recordingCallback = useRef(onRecordingChange);
  recordingCallback.current = onRecordingChange;

  useEffect(() => {
    recordingCallback.current(media.recording);
  }, [media.recording, onRecordingChange]);
  useEffect(() => () => recordingCallback.current(false), []);
  useEffect(() => {
    setDraft("");
    setSheet(null);
    setReaction(null);
    setImageView(null);
  }, [chat.id]);

  function guardRecording(action: () => void) {
    if (media.isRecording()) {
      Alert.alert(
        "Finish your voice note first",
        "Send or cancel the current recording before leaving or starting a call.",
      );
    } else action();
  }

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (imageView) setImageView(null);
        else if (reaction) setReaction(null);
        else if (sheet) setSheet(null);
        else guardRecording(onBack);
        return true;
      },
    );
    return () => subscription.remove();
  }, [onBack, media.isRecording, imageView, reaction, sheet]);

  function sendText() {
    const text = draft.trim();
    if (!text || media.isRecording()) return;
    onSend({ text });
    setDraft("");
  }

  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[s.chatHeader, { borderBottomColor: line }]}>
        <IconButton
          name="chevron-back"
          label="Back to chats"
          color={fg}
          onPress={() => guardRecording(onBack)}
        />
        <Avatar uri={chat.avatar} size={44} />
        <Pressable
          style={s.contact}
          onPress={() =>
            Alert.alert(
              chat.name,
              chat.group
                ? "A private group for your favorite people. This is a local prototype."
                : `${chat.online ? "Online now" : "Last seen recently"}\nMessages stay on this device in this prototype.`,
            )
          }
        >
          <Text style={[s.name, { color: fg }]}>{chat.name}</Text>
          <Text
            style={[
              s.tiny,
              {
                color: chat.online || typing ? "#74A68A" : muted,
                marginTop: 3,
              },
            ]}
          >
            {typing
              ? "typing…"
              : chat.group
                ? "Your little circle"
                : chat.online
                  ? "● Online"
                  : "Last seen recently"}
          </Text>
        </Pressable>
        <IconButton
          name="call-outline"
          label="Start voice call"
          color={fg}
          onPress={() => guardRecording(() => onCall(false))}
        />
        <IconButton
          name="videocam-outline"
          label="Start video call"
          color={fg}
          onPress={() => guardRecording(() => onCall(true))}
        />
      </View>
      <ScrollView
        ref={list}
        style={s.root}
        contentContainerStyle={s.messageList}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() =>
          list.current?.scrollToEnd({ animated: true })
        }
      >
        <View style={s.dateChip}>
          <Text style={[s.tiny, { color: muted }]}>TODAY</Text>
        </View>
        {messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            dark={dark}
            showTimestamp={
              index === messages.length - 1 ||
              messages[index + 1]?.mine !== message.mine
            }
            onReact={setReaction}
            onViewImage={setImageView}
          />
        ))}
        {typing && (
          <View style={[s.typing, { backgroundColor: card }]}>
            <Text style={{ color: coral, letterSpacing: 5 }}>● ● ●</Text>
          </View>
        )}
      </ScrollView>
      <View style={[s.composer, { backgroundColor: card }]}>
        {media.recording ? (
          <>
            <IconButton
              name="trash-outline"
              label="Cancel recording"
              color="#DE6666"
              onPress={() => void media.cancelRecord()}
            />
            <View style={s.liveDot} />
            <Text style={[s.body, { color: fg, flex: 1 }]}>
              Recording{" "}
              {formatDuration(Math.floor(media.durationMillis / 1000))}
            </Text>
            <IconButton
              name="send"
              label="Send voice note"
              background={coral}
              color="white"
              onPress={() => void media.record()}
            />
          </>
        ) : (
          <>
            <IconButton
              name="add"
              label="Attach media"
              color={muted}
              onPress={() => setSheet("attach")}
            />
            <TextInput
              accessibilityLabel="Message"
              value={draft}
              onChangeText={setDraft}
              placeholder="Message"
              placeholderTextColor={muted}
              style={[s.messageInput, { color: fg }]}
              multiline
              maxLength={4000}
            />
            <IconButton
              name="happy-outline"
              label="Choose emoji"
              color={muted}
              onPress={() => setSheet("emoji")}
            />
            <IconButton
              name={draft.trim() ? "arrow-up" : "mic-outline"}
              label={draft.trim() ? "Send message" : "Record voice note"}
              background={coral}
              color="white"
              onPress={() => (draft.trim() ? sendText() : void media.record())}
            />
          </>
        )}
      </View>
      <AttachmentMenu
        sheet={sheet}
        dark={dark}
        onClose={() => setSheet(null)}
        onEmoji={(emoji) => setDraft((value) => value + emoji)}
        onPhoto={(camera) => void media.pickPhoto(camera)}
        onFile={() => void media.pickFile()}
        onRecord={() => void media.record()}
      />
      <Modal
        transparent
        visible={reaction !== null}
        animationType="fade"
        onRequestClose={() => setReaction(null)}
      >
        <Pressable
          style={s.reactionOverlay}
          onPress={() => setReaction(null)}
          accessibilityLabel="Dismiss reactions"
        >
          <View style={[s.reactionBar, { backgroundColor: card }]}>
            {["🤍", "😂", "😍", "👍", "🔥", "✨"].map((emoji) => (
              <Pressable
                key={emoji}
                accessibilityLabel={`React ${emoji}`}
                onPress={() => {
                  tap();
                  if (reaction) onReact(reaction, emoji);
                  setReaction(null);
                }}
              >
                <Text style={{ fontSize: 30, padding: 9 }}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
      <Modal
        visible={imageView !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setImageView(null)}
      >
        <View style={s.imageViewer}>
          <View style={s.imageClose}>
            <IconButton
              name="close"
              label="Close image"
              color="white"
              onPress={() => setImageView(null)}
            />
          </View>
          {imageView && (
            <Image
              source={{ uri: imageView }}
              style={{ width: "100%", height: "80%" }}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
