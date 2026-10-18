import React from "react";
import { Alert, Image, Linking, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import type { Message } from "../../domain/data";
import { formatDuration } from "../../domain/model";
import { coral, palette } from "../../ui/theme";
import { tap } from "../../ui/primitives";
import { styles as s } from "./MessageBubble.styles";

function VoiceNote({
  message,
  dark,
  onLongPress,
}: {
  message: Message;
  dark: boolean;
  onLongPress: () => void;
}) {
  const player = useAudioPlayer(message.uri ?? null);
  const status = useAudioPlayerStatus(player);
  const color = message.mine ? "#FFF" : palette(dark).fg;

  async function togglePlayback() {
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
        player.play();
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
      onPress={() => void togglePlayback()}
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
  onReact: (messageId: string) => void;
  onViewImage: (uri: string) => void;
};

export default function MessageBubble({
  message: m,
  dark,
  showTimestamp,
  onReact,
  onViewImage,
}: MessageBubbleProps) {
  const { fg, muted, card } = palette(dark);
  const react = () => {
    tap();
    onReact(m.id);
  };
  function openAttachment() {
    if (!m.uri) return;
    if (m.kind === "image") onViewImage(m.uri);
    else if (m.kind === "file") {
      void Linking.openURL(m.uri).catch(() =>
        Alert.alert(
          m.filename || "Attachment",
          "The attachment is saved locally. This device cannot open its file type from the prototype.",
        ),
      );
    }
  }

  return (
    <View style={[s.messageRow, m.mine && { alignItems: "flex-end" }]}>
      <Pressable
        onLongPress={react}
        delayLongPress={300}
        onPress={
          m.kind === "image" || m.kind === "file" ? openAttachment : undefined
        }
        style={[
          s.bubble,
          { backgroundColor: m.mine ? (dark ? "#B86B57" : "#F4A18B") : card },
          m.mine ? s.bubbleMine : s.bubbleTheirs,
          m.kind === "image" && { padding: 5 },
        ]}
      >
        {m.kind === "image" ? (
          <Image
            source={{ uri: m.uri }}
            style={s.chatImage}
            accessibilityLabel="Photo attachment"
          />
        ) : m.kind === "audio" ? (
          <VoiceNote message={m} dark={dark} onLongPress={react} />
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
        {m.reaction && (
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
