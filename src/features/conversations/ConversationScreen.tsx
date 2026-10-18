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
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Chat, Message } from "../../domain/data";
import { Avatar, IconButton } from "../../ui/primitives";
import { coral, palette } from "../../ui/theme";
import Composer from "./Composer";
import { replySnapshot, withReply } from "./conversationModel";
import MessageActions, { type ActionTarget } from "./MessageActions";
import MessageBubble from "./MessageBubble";
import VideoAttachment from "./VideoAttachment";
import { useMessageMedia } from "./useMessageMedia";
import { styles as s } from "./ConversationScreen.styles";

export type ConversationScreenProps = {
  chat: Chat;
  messages: Message[];
  dark: boolean;
  typing: boolean;
  visible?: boolean;
  onBack: () => void;
  onCall: (video: boolean) => void;
  onSend: (message: Partial<Message>) => void;
  onReact: (messageId: string, emoji: string) => void;
  onRecordingChange: (recording: boolean) => void;
  onProfile: () => void;
  onDelete: (id: string, everyone: boolean) => void;
  onForward: (message: Message) => void;
};

export default function ConversationScreen({
  chat,
  messages,
  dark,
  typing,
  visible = true,
  onBack,
  onCall,
  onSend,
  onReact,
  onRecordingChange,
  onProfile,
  onDelete,
  onForward,
}: ConversationScreenProps) {
  const { bg, fg, muted, card, line } = palette(dark);
  const [draft, setDraft] = useState("");
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [target, setTarget] = useState<ActionTarget | null>(null);
  const [viewer, setViewer] = useState<Message | null>(null);
  const [reply, setReply] = useState<Message["replyTo"] | null>(null);
  const list = useRef<ScrollView>(null);
  const currentChat = useRef(chat.id);
  currentChat.current = chat.id;
  const send = (message: Partial<Message>) => {
    if (chat.blocked || currentChat.current !== chat.id) return;
    onSend(withReply(message, reply));
    setReply(null);
  };
  const media = useMessageMedia(send);
  const recordingCallback = useRef(onRecordingChange);
  recordingCallback.current = onRecordingChange;
  useEffect(() => {
    recordingCallback.current(media.recording);
  }, [media.recording, onRecordingChange]);
  useEffect(() => () => recordingCallback.current(false), []);
  useEffect(() => {
    setDraft("");
    setAttachmentOpen(false);
    setTarget(null);
    setViewer(null);
    setReply(null);
  }, [chat.id]);
  useEffect(() => {
    if (!visible) {
      setTarget(null);
      setAttachmentOpen(false);
      setViewer(null);
    }
  }, [visible]);
  useEffect(() => {
    if (
      reply &&
      messages.some((message) => message.id === reply.id && message.deleted)
    )
      setReply(null);
    if (
      target &&
      !messages.some(
        (message) => message.id === target.message.id && !message.deleted,
      )
    )
      setTarget(null);
    if (
      viewer &&
      !messages.some((message) => message.id === viewer.id && !message.deleted)
    )
      setViewer(null);
  }, [messages, reply, target, viewer]);

  function guardRecording(action: () => void) {
    if (media.isRecording())
      Alert.alert(
        "Finish your voice note first",
        "Send or cancel the current recording before leaving or starting a call.",
      );
    else action();
  }
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (viewer) setViewer(null);
        else if (target) setTarget(null);
        else if (attachmentOpen) setAttachmentOpen(false);
        else guardRecording(onBack);
        return true;
      },
    );
    return () => subscription.remove();
  }, [visible, onBack, media.isRecording, viewer, target, attachmentOpen]);
  function sendText() {
    const text = draft.trim();
    if (!text || media.isRecording()) return;
    send({ text });
    setDraft("");
  }
  function selectReply(message: Message) {
    setReply(replySnapshot(message));
    setAttachmentOpen(false);
  }

  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: bg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[s.chatHeader, { borderBottomColor: line }]}>
        <IconButton
          name="chevron-back"
          label="Back to chats"
          color={fg}
          onPress={() => guardRecording(onBack)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View ${chat.name}'s profile`}
          onPress={() => guardRecording(onProfile)}
        >
          <Avatar uri={chat.avatar} size={44} />
        </Pressable>
        <Pressable
          style={s.contact}
          accessibilityRole="button"
          accessibilityLabel={`View ${chat.name}'s profile`}
          onPress={() => guardRecording(onProfile)}
        >
          <Text numberOfLines={1} style={[s.name, { color: fg }]}>
            {chat.name}
            {chat.muted ? " · Muted" : ""}
          </Text>
          <Text
            style={[
              s.tiny,
              {
                color: chat.online || typing ? "#74A68A" : muted,
                marginTop: 3,
              },
            ]}
          >
            {chat.blocked
              ? "Blocked"
              : typing
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
      <View style={s.root}>
        <ScrollView
          ref={list}
          style={s.root}
          contentContainerStyle={s.messageList}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => setAttachmentOpen(false)}
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
              visible={visible}
              showTimestamp={
                index === messages.length - 1 ||
                messages[index + 1]?.mine !== message.mine
              }
              onActions={(next) => {
                setAttachmentOpen(false);
                setTarget(next);
              }}
              onReact={onReact}
              onViewMedia={setViewer}
            />
          ))}
          {typing && (
            <View style={[s.typing, { backgroundColor: card }]}>
              <Text style={{ color: coral, letterSpacing: 5 }}>● ● ●</Text>
            </View>
          )}
        </ScrollView>
        {attachmentOpen && (
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityLabel="Dismiss attachments"
            onPress={() => setAttachmentOpen(false)}
          />
        )}
      </View>
      <Composer
        dark={dark}
        draft={draft}
        setDraft={setDraft}
        reply={reply}
        onCancelReply={() => setReply(null)}
        onSend={sendText}
        media={media}
        attachmentOpen={visible && attachmentOpen}
        setAttachmentOpen={setAttachmentOpen}
        disabled={!!chat.blocked}
      />
      <MessageActions
        target={visible ? target : null}
        dark={dark}
        onClose={() => setTarget(null)}
        onReact={onReact}
        onReply={selectReply}
        onForward={(message) => guardRecording(() => onForward(message))}
        onDelete={onDelete}
      />
      <Modal
        visible={visible && viewer !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewer(null)}
      >
        <View style={s.imageViewer}>
          <View style={s.imageClose}>
            <IconButton
              name="close"
              label="Close media"
              color="white"
              onPress={() => setViewer(null)}
            />
          </View>
          {visible &&
            viewer?.uri &&
            (viewer.kind === "video" ? (
              <VideoAttachment uri={viewer.uri} />
            ) : (
              <Image
                source={{ uri: viewer.uri }}
                style={{ width: "100%", height: "80%" }}
                resizeMode="contain"
              />
            ))}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
