import React, { useEffect, useRef } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import type { Message } from "../../domain/data";
import type { ActionTarget } from "./MessageActions";
import { formatDuration } from "../../domain/model";
import { palette, radius, space } from "../../ui/theme";
import { tap } from "../../ui/primitives";
import { openAttachment } from "../../ui/openAttachment";
import { ResponsiveImage } from "../../ui/ResponsiveImage";
import { messageAccessibilityLabel } from "./conversationModel";
import { styles as s } from "./MessageBubble.styles";

type VoiceNoteHandle = { toggle: () => void };

const VoiceNote = React.forwardRef<
  VoiceNoteHandle,
  {
    message: Message;
    dark: boolean;
    onRetry: () => void;
    visible: boolean;
  }
>(function VoiceNote({ message, dark, onRetry, visible }, ref) {
  const player = useAudioPlayer(message.uri ?? null);
  const status = useAudioPlayerStatus(player);
  const colors = palette(dark);
  const color = message.mine ? colors.outgoingFg : colors.fg;
  const activeWave = message.mine ? color : colors.coralInk;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  useEffect(() => {
    if (!visible) player.pause();
  }, [visible, player, status.playing]);

  async function togglePlayback() {
    if (!visibleRef.current) return;
    if (message.status === "failed") {
      onRetry();
      return;
    }
    if (!message.uri) {
      Alert.alert(
        "Voice note unavailable",
        "This voice note has no audio file.",
      );
      return;
    }
    try {
      if (status.playing) player.pause();
      else {
        if (status.didJustFinish) await player.seekTo(0);
        if (visibleRef.current) player.play();
      }
    } catch {
      Alert.alert(
        "Couldn't play voice note",
        "Please try playing the recording again.",
      );
    }
  }

  React.useImperativeHandle(ref, () => ({
    toggle: () => void togglePlayback(),
  }));

  return (
    <View style={s.voice}>
      <View style={[s.voicePlay, { backgroundColor: colors.tint }]}>
        <Ionicons
          name={status.playing ? "pause" : "play"}
          size={18}
          color={colors.coralInk}
        />
      </View>
      <View style={s.wave}>
        {Array.from({ length: 28 }, (_, i) => (
          <View
            key={i}
            style={{
              width: 4,
              borderRadius: 2,
              height: 7 + ((i * 17 + 7) % 23),
              backgroundColor:
                i / 28 < status.currentTime / (status.duration || 1)
                  ? activeWave
                  : colors.line,
            }}
          />
        ))}
      </View>
      <Text style={[s.tiny, { color }]}>
        {formatDuration(
          Math.round(
            status.playing
              ? status.currentTime
              : message.duration || status.duration || 0,
          ),
        )}
      </Text>
    </View>
  );
});

function DeliveryMeta({
  message,
  dark,
  showTimestamp,
}: {
  message: Message;
  dark: boolean;
  showTimestamp: boolean;
}) {
  const { muted, danger } = palette(dark);
  const pending = message.status === "sending" || message.status === "failed";
  const uploading =
    message.status === "sending" && message.kind && message.uploadProgress !== undefined
      ? Math.max(0, Math.min(100, Math.round(message.uploadProgress * 100)))
      : null;
  if (!showTimestamp && !pending) return null;
  return (
    <View style={s.messageMeta}>
      <Text style={[s.tiny, { color: muted }]}>{message.time}</Text>
      {message.mine && message.status === "failed" ? (
        <>
          <Ionicons name="alert-circle" size={14} color={danger} />
          <Text
            accessibilityLiveRegion="polite"
            style={[s.tiny, { color: danger }]}
          >
            Not sent. Tap to retry.
          </Text>
        </>
      ) : message.mine && message.status === "sending" ? (
        <>
          <Ionicons
            name={uploading !== null ? "cloud-upload-outline" : "time-outline"}
            size={14}
            color={muted}
          />
          <Text accessibilityLiveRegion="polite" style={[s.tiny, { color: muted }]}>
            {uploading === null
              ? "Sending…"
              : uploading === 0
                ? "Uploading…"
                : `Uploading ${uploading}%`}
          </Text>
        </>
      ) : message.mine ? (
        <Ionicons name="checkmark" size={15} color={muted} />
      ) : null}
    </View>
  );
}

export type MessageBubbleProps = {
  message: Message;
  dark: boolean;
  showTimestamp: boolean;
  visible?: boolean;
  onActions: (target: ActionTarget) => void;
  onReact: (messageId: string, emoji: string) => void;
  onViewMedia: (message: Message) => void;
  onRetry: (messageId: string) => void;
};

export default function MessageBubble({
  message: m,
  dark,
  showTimestamp,
  visible = true,
  onActions,
  onReact,
  onViewMedia,
  onRetry,
}: MessageBubbleProps) {
  const {
    fg,
    muted,
    card,
    tint,
    media,
    outgoingBg,
    outgoingFg,
    outgoingMuted,
    coralInk,
    onImage,
  } =
    palette(dark);
  const bubble = useRef<View>(null);
  const voice = useRef<VoiceNoteHandle>(null);
  const pendingTap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  useEffect(() => {
    if (!visible && pendingTap.current) {
      clearTimeout(pendingTap.current);
      pendingTap.current = null;
    }
  }, [visible]);
  useEffect(
    () => () => {
      if (pendingTap.current) clearTimeout(pendingTap.current);
    },
    [],
  );
  const react = () => {
    // A send that is still on its way has no server id to delete or react to;
    // removing its bubble locally would only make it reappear on the echo.
    if (
      m.deleted ||
      !visibleRef.current ||
      (m.status && m.status !== "failed")
    ) {
      return;
    }
    longPressed.current = true;
    if (pendingTap.current) clearTimeout(pendingTap.current);
    pendingTap.current = null;
    bubble.current?.measureInWindow((x, y, width, height) => {
      if (!visibleRef.current) return;
      tap();
      onActions({ message: m, rect: { x, y, width, height } });
    });
  };
  // Only text keeps the double-tap reaction. Media, files and voice notes act
  // on the first tap so opening an attachment never feels delayed.
  function handleTap() {
    if (m.deleted || !visibleRef.current) return;
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (m.status === "failed") {
      onRetry(m.id);
      return;
    }
    if (m.kind === "audio") {
      voice.current?.toggle();
      return;
    }
    if (m.kind) {
      viewAttachment();
      return;
    }
    // A local-only text bubble is replaced by the server row once confirmed;
    // reacting before that would leave an optimistic reaction with no target.
    if (m.status) return;
    if (pendingTap.current) {
      clearTimeout(pendingTap.current);
      pendingTap.current = null;
      tap();
      onReact(m.id, "🤍");
    } else
      pendingTap.current = setTimeout(() => {
        pendingTap.current = null;
      }, 260);
  }
  function viewAttachment() {
    if (!m.uri) return;
    if (m.kind === "image" || m.kind === "video") onViewMedia(m);
    else if (m.kind === "file") {
      void openAttachment(m.uri, m.filename);
    }
  }
  const actionsAvailable =
    !m.deleted && (!m.status || m.status === "failed");
  const actionsHint = actionsAvailable
    ? " Long press for message actions."
    : "";
  const accessibilityActions = actionsAvailable
    ? [
        { name: "longpress", label: "Message actions" },
        ...(m.status === "failed"
          ? [{ name: "retry", label: "Retry sending" }]
          : []),
      ]
    : undefined;
  const accessibilityHint = m.deleted
    ? undefined
    : m.status === "failed"
      ? `Double tap to retry sending.${actionsHint}`
      : m.kind === "audio"
        ? `Double tap to play or pause.${actionsHint}`
        : m.kind
          ? `Double tap to open.${actionsHint}`
          : actionsAvailable
            ? "Long press or use message actions to react or act on this message."
            : undefined;

  return (
    <View style={[s.messageRow, m.mine && { alignItems: "flex-end" }]}>
      <Pressable
        ref={bubble}
        onPressIn={() => {
          longPressed.current = false;
        }}
        onLongPress={react}
        delayLongPress={300}
        disabled={m.deleted}
        accessibilityRole={m.kind || m.status === "failed" ? "button" : "text"}
        accessibilityLabel={messageAccessibilityLabel(m)}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: Boolean(m.deleted) }}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === "longpress") react();
          else if (nativeEvent.actionName === "retry") onRetry(m.id);
        }}
        onPress={handleTap}
        style={[
          s.bubble,
          { backgroundColor: m.mine ? outgoingBg : card },
          m.mine ? s.bubbleMine : s.bubbleTheirs,
          m.kind === "image" && { padding: space.xs },
        ]}
      >
        {m.forwarded && !m.deleted && (
          <View style={s.forwarded}>
            <Ionicons
              name="arrow-redo"
              size={14}
              color={m.mine ? outgoingMuted : muted}
            />
            <Text style={[s.tiny, { color: m.mine ? outgoingMuted : muted }]}>
              Forwarded
            </Text>
          </View>
        )}
        {m.replyTo && !m.deleted && (
          <View
            style={{
              borderLeftWidth: 4,
              borderLeftColor: m.mine ? outgoingMuted : coralInk,
              backgroundColor: tint,
              borderRadius: radius.badge,
              padding: space.sm,
              marginBottom: space.sm,
            }}
          >
            <Text style={[s.tiny, { color: m.mine ? outgoingMuted : muted }]}>
              {m.replyTo.mine ? "You" : "Reply"}
            </Text>
            <Text numberOfLines={2} style={{ color: m.mine ? outgoingFg : fg }}>
              {m.replyTo.text}
            </Text>
          </View>
        )}
        {m.deleted ? (
          <Text style={[s.messageText, { color: muted, fontStyle: "italic" }]}>
            Message deleted
          </Text>
        ) : m.kind === "video" ? (
          <View
            style={[
              s.chatImage,
              {
                backgroundColor: media,
                justifyContent: "center",
                alignItems: "center",
              },
            ]}
          >
            <Ionicons name="play-circle" size={56} color={onImage} />
            <Text style={{ color: onImage }}>Video · Tap to play</Text>
          </View>
        ) : m.kind === "image" ? (
          <ResponsiveImage
            uri={m.uri}
            variants={m.variants}
            sourceWidth={m.width}
            previewUri={m.previewUri}
            previewWidth={m.previewWidth}
            displayWidth={220}
            style={s.chatImage}
            contentFit="cover"
            recyclingKey={m.id}
            accessibilityLabel="Photo attachment"
          />
        ) : m.kind === "audio" ? (
          <VoiceNote
            ref={voice}
            message={m}
            dark={dark}
            onRetry={() => onRetry(m.id)}
            visible={visible}
          />
        ) : m.kind === "file" ? (
          <View style={s.file}>
            <Ionicons
              name="document-text-outline"
              size={28}
              color={m.mine ? outgoingFg : coralInk}
            />
            <Text
              numberOfLines={2}
              style={[s.body, { color: m.mine ? outgoingFg : fg, flex: 1 }]}
            >
              {m.filename}
            </Text>
            <Ionicons
              name="open-outline"
              size={17}
              color={m.mine ? outgoingMuted : muted}
            />
          </View>
        ) : (
          <Text style={[s.messageText, { color: m.mine ? outgoingFg : fg }]}>
            {m.text}
          </Text>
        )}
        {m.reaction && !m.deleted && (
          <View style={[s.reaction, { backgroundColor: card }]}>
            <Text>{m.reaction}</Text>
          </View>
        )}
      </Pressable>
      <DeliveryMeta
        message={m}
        dark={dark}
        showTimestamp={showTimestamp}
      />
    </View>
  );
}
