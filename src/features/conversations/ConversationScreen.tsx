import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import type { Chat, Message } from "../../domain/data";
import { Avatar, IconButton } from "../../ui/primitives";
import { ResponsiveImage } from "../../ui/ResponsiveImage";
import { palette } from "../../ui/theme";
import Composer from "./Composer";
import { replySnapshot, withReply } from "./conversationModel";
import MessageActions, { type ActionTarget } from "./MessageActions";
import AlbumViewer from "./AlbumViewer";
import ConversationList from "./ConversationList";
import VideoAttachment from "./VideoAttachment";
import { useMessageMedia } from "./useMessageMedia";
import { MediaPicker } from "../media/MediaPicker";
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
  onSaveMedia?: (message: Message) => Promise<boolean>;
  onTypingChange?: (typing: boolean) => void;
  onRetry: (messageId: string) => void;
  /** True while the server may still hold rows older than the local page. */
  hasOlder?: boolean;
  loadingOlder?: boolean;
  /** The last older-page read failed; the control offers a retry. */
  loadOlderFailed?: boolean;
  onLoadOlder?: () => void;
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
  onSaveMedia,
  onTypingChange,
  onRetry,
  hasOlder = false,
  loadingOlder = false,
  loadOlderFailed = false,
  onLoadOlder,
}: ConversationScreenProps) {
  const { bg, fg, muted, line } = palette(dark);
  const { width: windowWidth } = useWindowDimensions();
  const [draft, setDraft] = useState("");
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [target, setTarget] = useState<ActionTarget | null>(null);
  const [viewer, setViewer] = useState<Message | null>(null);
  const [album, setAlbum] = useState<{ ids: string[]; initialId: string } | null>(null);
  const albumMessages = album
    ? messages.filter((message) => album.ids.includes(message.id) && !message.deleted)
    : [];
  const [reply, setReply] = useState<Message["replyTo"] | null>(null);
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
    setAlbum(null);
    setReply(null);
  }, [chat.id]);
  // Only signal a transition: React runs effect cleanups before every key, so
  // the old version sent a false/true pair for every character typed.
  const typingCallback = useRef(onTypingChange);
  typingCallback.current = onTypingChange;
  const typingActive = useRef(false);
  useEffect(() => {
    const next = draft.trim().length > 0;
    if (typingActive.current === next) return;
    typingActive.current = next;
    typingCallback.current?.(next);
  }, [draft]);
  useEffect(
    () => () => {
      if (!typingActive.current) return;
      typingActive.current = false;
      typingCallback.current?.(false);
    },
    [],
  );
  useEffect(() => {
    if (!visible) {
      setTarget(null);
      setAttachmentOpen(false);
      setViewer(null);
      setAlbum(null);
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
    if (album && !messages.some((message) => album.ids.includes(message.id) && !message.deleted))
      setAlbum(null);
  }, [messages, reply, target, viewer, album]);

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
        if (album) setAlbum(null);
        else if (viewer) setViewer(null);
        else if (target) setTarget(null);
        else if (attachmentOpen) setAttachmentOpen(false);
        else guardRecording(onBack);
        return true;
      },
    );
    return () => subscription.remove();
  }, [visible, onBack, media.isRecording, viewer, album, target, attachmentOpen]);
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
  const onActions = useCallback((nextTarget: ActionTarget) => {
    setAttachmentOpen(false);
    setTarget(nextTarget);
  }, []);
  const onOpenAlbum = useCallback((ids: string[], initialId: string) => {
    setAlbum({ ids, initialId });
  }, []);

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
          <Avatar uri={chat.avatar} name={chat.name} size={44} />
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
                color:
                  chat.online || typing
                    ? dark
                      ? "#9FD0B2"
                      : "#2F6A4B"
                    : muted,
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
        {!chat.group && (
          <>
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
          </>
        )}
      </View>
      <View style={s.root}>
        <ConversationList
          chatId={chat.id}
          messages={messages}
          dark={dark}
          visible={visible}
          typing={typing}
          hasOlder={hasOlder}
          loadingOlder={loadingOlder}
          loadOlderFailed={loadOlderFailed}
          onLoadOlder={onLoadOlder}
          onScrollBeginDrag={() => setAttachmentOpen(false)}
          onActions={onActions}
          onReact={onReact}
          onViewMedia={setViewer}
          onOpenAlbum={onOpenAlbum}
          onRetry={onRetry}
        />
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
      <Modal
        visible={visible && media.pickerOpen}
        animationType="slide"
        onRequestClose={media.closePicker}
      >
        <MediaPicker
          dark={dark}
          title="Share media"
          permissionTitle="Choose media to share"
          permissionText="Allow Messenger to see your photos and videos so you can share them in this conversation."
          emptyTitle="No photos or videos yet"
          emptyText="Take a photo or video to share it here."
          onPicked={media.pickMedia}
          onClose={media.closePicker}
        />
      </Modal>
      <MessageActions
        target={visible ? target : null}
        dark={dark}
        onClose={() => setTarget(null)}
        onReact={onReact}
        onReply={selectReply}
        onForward={(message) => guardRecording(() => onForward(message))}
        onSave={
          onSaveMedia
            ? (message) => {
                void onSaveMedia(message)
                  .then((saved) =>
                    Alert.alert(
                      saved ? "Saved to gallery" : "Not saved",
                      saved
                        ? "The media is in your Messenger album."
                        : "The media could not be copied to your gallery.",
                    ),
                  )
                  .catch(() =>
                    Alert.alert("Not saved", "Please try again."),
                  );
              }
            : undefined
        }
        onDelete={onDelete}
        onRetry={onRetry}
      />
      {album && (
        <AlbumViewer
          key={album.initialId}
          messages={albumMessages}
          initialId={album.initialId}
          visible={visible}
          onClose={() => setAlbum(null)}
          onActions={(nextTarget) => {
            setAttachmentOpen(false);
            setTarget(nextTarget);
          }}
        />
      )}
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
              <ResponsiveImage
                uri={viewer.uri}
                variants={viewer.variants}
                sourceWidth={viewer.width}
                previewUri={viewer.previewUri}
                previewWidth={viewer.previewWidth}
                displayWidth={windowWidth}
                style={{ width: "100%", height: "80%" }}
                contentFit="contain"
              />
            ))}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
