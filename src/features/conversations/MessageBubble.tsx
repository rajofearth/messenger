import React, { useEffect, useRef } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import type { Message } from "../../domain/data";
import type { ActionTarget } from "./MessageActions";
import { formatDuration } from "../../domain/model";
import { coral, palette } from "../../ui/theme";
import { tap } from "../../ui/primitives";
import { openAttachment } from "../../ui/openAttachment";
import { styles as s } from "./MessageBubble.styles";

function VoiceNote({
  message,
  dark,
  onLongPress,
  onTap,
  visible,
}: {
  message: Message;
  dark: boolean;
  onLongPress: () => void;
  onTap: (action: () => void) => void;
  visible: boolean;
}) {
  const player = useAudioPlayer(message.uri ?? null);
  const status = useAudioPlayerStatus(player);
  const color = message.mine ? "#FFF" : palette(dark).fg;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  useEffect(() => {
    if (!visible) player.pause();
  }, [visible, player, status.playing]);

  async function togglePlayback() {
    if (!visibleRef.current) return;
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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        status.playing ? "Pause voice note" : "Play voice note"
      }
      onPress={() => onTap(() => void togglePlayback())}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={s.voice}
    >
      <View style={s.voicePlay}>
        <Ionicons
          name={status.playing ? "pause" : "play"}
          size={18}
          color={coral}
        />
      </View>
      <View style={s.wave}>
        {Array.from({ length: 28 }, (_, i) => (
          <View
            key={i}
            style={{
              width: 3,
              borderRadius: 3,
              height: 7 + ((i * 17 + 7) % 23),
              backgroundColor:
                i / 28 < status.currentTime / (status.duration || 1)
                  ? coral
                  : "#C7BAB1",
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
    </Pressable>
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
};

export default function MessageBubble({
  message: m,
  dark,
  showTimestamp,
  visible = true,
  onActions,
  onReact,
  onViewMedia,
}: MessageBubbleProps) {
  const { fg, muted, card } = palette(dark);
  const bubble = useRef<View>(null);
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
    if (m.deleted || !visibleRef.current) return;
    longPressed.current = true;
    if (pendingTap.current) clearTimeout(pendingTap.current);
    pendingTap.current = null;
    bubble.current?.measureInWindow((x, y, width, height) => {
      if (!visibleRef.current) return;
      tap();
      onActions({ message: m, rect: { x, y, width, height } });
    });
  };
  function handleTap(action: () => void = () => {}) {
    if (m.deleted || !visibleRef.current || longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (pendingTap.current) {
      clearTimeout(pendingTap.current);
      pendingTap.current = null;
      tap();
      onReact(m.id, "🤍");
    } else
      pendingTap.current = setTimeout(() => {
        pendingTap.current = null;
        if (visibleRef.current) action();
      }, 260);
  }
  function viewAttachment() {
    if (!m.uri) return;
    if (m.kind === "image" || m.kind === "video") onViewMedia(m);
    else if (m.kind === "file") {
      void openAttachment(m.uri, m.filename);
    }
  }

  return (
    <View style={[s.messageRow, m.mine && { alignItems: "flex-end" }]}>
      <Pressable
        ref={bubble}
        onPressIn={() => {
          longPressed.current = false;
        }}
        onLongPress={react}
        delayLongPress={300}
        onPress={() => handleTap(viewAttachment)}
        style={[
          s.bubble,
          { backgroundColor: m.mine ? (dark ? "#B86B57" : "#F4A18B") : card },
          m.mine ? s.bubbleMine : s.bubbleTheirs,
          m.kind === "image" && { padding: 5 },
        ]}
      >
        {m.forwarded && !m.deleted && (
          <Text
            style={[
              s.tiny,
              { color: m.mine ? "#FFF" : muted, marginBottom: 6 },
            ]}
          >
            ↪ Forwarded
          </Text>
        )}
        {m.replyTo && !m.deleted && (
          <View
            style={{
              borderLeftWidth: 3,
              borderLeftColor: coral,
              backgroundColor: "#00000010",
              borderRadius: 6,
              padding: 8,
              marginBottom: 8,
            }}
          >
            <Text style={[s.tiny, { color: m.mine ? "#FFF" : muted }]}>
              {m.replyTo.mine ? "You" : "Reply"}
            </Text>
            <Text numberOfLines={2} style={{ color: m.mine ? "#FFF" : fg }}>
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
                backgroundColor: "#292C29",
                justifyContent: "center",
                alignItems: "center",
              },
            ]}
          >
            <Ionicons name="play-circle" size={56} color="white" />
            <Text style={{ color: "white" }}>Video · Tap to play</Text>
          </View>
        ) : m.kind === "image" ? (
          <Image
            source={{ uri: m.uri }}
            recyclingKey={m.id}
            style={s.chatImage}
            contentFit="cover"
            accessibilityLabel="Photo attachment"
          />
        ) : m.kind === "audio" ? (
          <VoiceNote
            message={m}
            dark={dark}
            onLongPress={react}
            onTap={handleTap}
            visible={visible}
          />
        ) : m.kind === "file" ? (
          <View style={s.file}>
            <Ionicons
              name="document-text-outline"
              size={28}
              color={m.mine ? "#FFF" : coral}
            />
            <Text
              numberOfLines={2}
              style={[s.body, { color: m.mine ? "#FFF" : fg, flex: 1 }]}
            >
              {m.filename}
            </Text>
            <Ionicons name="open-outline" size={17} color={muted} />
          </View>
        ) : (
          <Text style={[s.messageText, { color: m.mine ? "#FFF" : fg }]}>
            {m.text}
          </Text>
        )}
        {m.reaction && !m.deleted && (
          <View style={s.reaction}>
            <Text>{m.reaction}</Text>
          </View>
        )}
      </Pressable>
      {showTimestamp && (
        <View style={s.messageMeta}>
          <Text style={[s.tiny, { color: muted }]}>{m.time}</Text>
          {m.mine && <Ionicons name="checkmark-done" size={14} color={coral} />}
        </View>
      )}
    </View>
  );
}
