import React from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { IconButton, tap, type IconName } from "../../ui/primitives";
import { coral, palette } from "../../ui/theme";
import { styles as s } from "./ConversationScreen.styles";

export type AttachmentMenuProps = {
  sheet: "attach" | "emoji" | null;
  dark: boolean;
  onClose: () => void;
  onEmoji: (emoji: string) => void;
  onPhoto: (camera: boolean) => void;
  onFile: () => void;
  onRecord: () => void;
};
const emojis = [
  "😊",
  "😂",
  "✨",
  "🤍",
  "👋",
  "🙌",
  "❤️",
  "😍",
  "🎉",
  "☕",
  "👍",
  "🔥",
  "🥹",
  "💬",
  "🌸",
  "🫶",
  "😎",
  "🤔",
  "💛",
  "🌈",
  "👌",
];

export default function AttachmentMenu({
  sheet,
  dark,
  onClose,
  onEmoji,
  onPhoto,
  onFile,
  onRecord,
}: AttachmentMenuProps) {
  const { bg, fg, muted } = palette(dark);
  const actions: {
    icon: IconName;
    title: string;
    subtitle: string;
    run: () => void;
  }[] = [
    {
      icon: "images-outline",
      title: "Photo library",
      subtitle: "Share a photo from your camera roll",
      run: () => onPhoto(false),
    },
    {
      icon: "camera-outline",
      title: "Camera",
      subtitle: "Capture something in the moment",
      run: () => onPhoto(true),
    },
    {
      icon: "document-attach-outline",
      title: "File",
      subtitle: "Documents, videos, audio, and more",
      run: onFile,
    },
    {
      icon: "mic-outline",
      title: "Voice note",
      subtitle: "Record a voice message",
      run: onRecord,
    },
  ];
  return (
    <Modal
      transparent
      visible={sheet !== null}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={s.modalWrap}>
        <Pressable
          style={s.scrim}
          onPress={onClose}
          accessibilityLabel="Dismiss menu"
        />
        <View style={[s.sheet, { backgroundColor: bg }]}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <Text style={[s.sheetTitle, { color: fg }]}>
              {sheet === "attach" ? "Attachments" : "Emoji"}
            </Text>
            <IconButton
              name="close"
              label="Close menu"
              color={fg}
              onPress={onClose}
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 470 }}
          >
            {sheet === "attach" ? (
              actions.map((action) => (
                <Pressable
                  key={action.title}
                  accessibilityRole="button"
                  onPress={() => {
                    tap();
                    onClose();
                    action.run();
                  }}
                  style={s.actionRow}
                >
                  <View style={s.actionIcon}>
                    <Ionicons name={action.icon} size={23} color={coral} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.body, { color: fg }]}>{action.title}</Text>
                    <Text style={[s.tiny, { color: muted, marginTop: 4 }]}>
                      {action.subtitle}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={muted} />
                </Pressable>
              ))
            ) : (
              <View style={s.emojiGrid}>
                {emojis.map((emoji) => (
                  <Pressable
                    key={emoji}
                    accessibilityLabel={`Insert ${emoji}`}
                    onPress={() => {
                      tap();
                      onEmoji(emoji);
                      onClose();
                    }}
                    style={s.emojiCell}
                  >
                    <Text style={{ fontSize: 29 }}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
