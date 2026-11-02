import React, { useRef, useState } from "react";
import {
  Alert,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { KeyboardMediaInput } from "../../ui/KeyboardMediaInput";
import type { Message } from "../../domain/data";
import { formatDuration } from "../../domain/model";
import { IconButton } from "../../ui/primitives";
import { palette, radius, space } from "../../ui/theme";
import AttachmentMenu from "./AttachmentMenu";
import RecordingWaveform from "./RecordingWaveform";
import type { useMessageMedia } from "./useMessageMedia";
import { styles as s } from "./ConversationScreen.styles";

export default function Composer({
  dark,
  draft,
  setDraft,
  reply,
  onCancelReply,
  onSend,
  media,
  attachmentOpen,
  setAttachmentOpen,
  disabled,
}: {
  dark: boolean;
  draft: string;
  setDraft: (text: string) => void;
  reply: Message["replyTo"] | null;
  onCancelReply: () => void;
  onSend: () => void;
  media: ReturnType<typeof useMessageMedia>;
  attachmentOpen: boolean;
  setAttachmentOpen: (open: boolean) => void;
  disabled: boolean;
}) {
  const { fg, muted, input: inputSurface, line, danger } = palette(dark);
  const actionBackground = dark ? "#F4F4F4" : fg;
  const actionForeground = dark ? "#111111" : "#FFFFFF";
  const input = useRef<TextInput>(null);
  const [top, setTop] = useState(260);
  const host = useRef<View>(null);
  const { height } = useWindowDimensions();
  return (
    <View
      ref={host}
      onLayout={() => host.current?.measureInWindow((_x, y) => setTop(y))}
    >
      {attachmentOpen && !disabled && (
        <AttachmentMenu
          dark={dark}
          maxHeight={Math.max(48, Math.min(260, top - 16, height * 0.4))}
          onClose={() => setAttachmentOpen(false)}
          onPhoto={(camera) => void media.pickPhoto(camera)}
          onFile={() => void media.pickFile()}
          onRecord={() => void media.record()}
        />
      )}
      {reply && !disabled && (
        <View
          style={{
            marginHorizontal: space.xl,
            borderLeftWidth: 4,
            borderLeftColor: line,
            backgroundColor: inputSurface,
            paddingLeft: space.md,
            flexDirection: "row",
            alignItems: "center",
            borderRadius: radius.control,
          }}
        >
          <View style={{ flex: 1, paddingVertical: space.sm }}>
            <Text style={{ color: muted, fontSize: 12, fontFamily: "sans-serif-medium" }}>
              Replying to {reply.mine ? "yourself" : "message"}
            </Text>
            <Text numberOfLines={2} style={{ color: fg }}>
              {reply.text}
            </Text>
          </View>
          <IconButton
            name="close"
            label="Cancel reply"
            color={muted}
            onPress={onCancelReply}
          />
        </View>
      )}
      <View style={[s.composer, { backgroundColor: inputSurface, borderColor: line }]}>
        {disabled ? (
          <>
            <Ionicons name="lock-closed-outline" size={17} color={muted} />
            <Text style={[s.blockedText, { color: muted }]}>
              This contact is blocked. Unblock them in chat details to send
              messages.
            </Text>
          </>
        ) : media.recording ? (
          <>
            <IconButton
              name="trash-outline"
              label="Cancel recording"
              color={danger}
              onPress={() => void media.cancelRecord()}
            />
            <View style={[s.liveDot, { backgroundColor: danger }]} />
            <RecordingWaveform
              metering={media.metering}
              color={fg}
            />
            <Text style={{ color: fg }}>
              {formatDuration(Math.floor(media.durationMillis / 1000))}
            </Text>
            <IconButton
              name="send"
              label="Send voice note"
              background={actionBackground}
              color={actionForeground}
              onPress={() => void media.record()}
            />
          </>
        ) : (
          <>
            <IconButton
              name="add"
              label={attachmentOpen ? "Close attachments" : "Attach media"}
              color={muted}
              onPress={() => {
                if (!disabled) setAttachmentOpen(!attachmentOpen);
              }}
            />
            <KeyboardMediaInput
              ref={input}
              onMedia={(item) => {
                if (!disabled) media.receiveKeyboardMedia(item);
              }}
              onMediaError={({ message }) =>
                Alert.alert("Keyboard attachment unavailable", message)
              }
              accessibilityLabel="Message"
              editable={!disabled}
              value={draft}
              onChangeText={setDraft}
              onFocus={() => setAttachmentOpen(false)}
              placeholder={
                disabled ? "This conversation is blocked" : "Message"
              }
              placeholderTextColor={muted}
              style={[s.messageInput, { color: fg }]}
              multiline
              maxLength={4000}
            />
            <IconButton
              name="keypad-outline"
              label="Open keyboard"
              color={muted}
              onPress={() => {
                setAttachmentOpen(false);
                if (input.current?.isFocused()) {
                  input.current.blur();
                  requestAnimationFrame(() => input.current?.focus());
                } else input.current?.focus();
              }}
            />
            <IconButton
              name={draft.trim() ? "arrow-up" : "mic-outline"}
              label={draft.trim() ? "Send message" : "Record voice note"}
              background={actionBackground}
              color={actionForeground}
              onPress={() => {
                if (!disabled) {
                  setAttachmentOpen(false);
                  if (draft.trim()) onSend();
                  else void media.record();
                }
              }}
            />
          </>
        )}
      </View>
    </View>
  );
}
