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
import { coral, palette } from "../../ui/theme";
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
  const { card, coralInk, fg, muted, onCoral } = palette(dark);
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
            marginHorizontal: 20,
            borderLeftWidth: 3,
            borderLeftColor: coralInk,
            backgroundColor: card,
            paddingLeft: 12,
            flexDirection: "row",
            alignItems: "center",
            borderRadius: 8,
          }}
        >
          <View style={{ flex: 1, paddingVertical: 8 }}>
            <Text style={{ color: coralInk, fontSize: 12 }}>
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
      <View style={[s.composer, { backgroundColor: card }]}>
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
              color={dark ? "#FFB4AB" : "#B3261E"}
              onPress={() => void media.cancelRecord()}
            />
            <View style={s.liveDot} />
            <RecordingWaveform
              metering={media.metering}
              color={coralInk}
            />
            <Text style={{ color: fg }}>
              {formatDuration(Math.floor(media.durationMillis / 1000))}
            </Text>
            <IconButton
              name="send"
              label="Send voice note"
              background={coral}
              color={onCoral}
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
              background={coral}
              color={onCoral}
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
