import React, { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Message } from "../../domain/data";
import { messageActionsLayout } from "./messageActionsLayout";
import { palette } from "../../ui/theme";
import { tap } from "../../ui/primitives";
import { deleteOptions } from "./conversationModel";

export type MessageRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type ActionTarget = { message: Message; rect: MessageRect };
export const reactionEmojis = ["🤍", "😂", "😍", "👍", "🔥", "✨"];

export function confirmDelete(
  message: Message,
  onDelete: (id: string, everyone: boolean) => void,
) {
  Alert.alert(
    "Delete message?",
    message.mine
      ? "Delete for everyone removes this message for all participants."
      : "You can only delete this message for yourself. Only its sender can delete it for everyone.",
    deleteOptions(message, onDelete),
  );
}

export default function MessageActions({
  target,
  dark,
  onClose,
  onReact,
  onReply,
  onForward,
  onDelete,
}: {
  target: ActionTarget | null;
  dark: boolean;
  onClose: () => void;
  onReact: (id: string, emoji: string) => void;
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onDelete: (id: string, everyone: boolean) => void;
}) {
  const { width, height } = useWindowDimensions();
  const [menuHeight, setMenuHeight] = useState(200);
  const insets = useSafeAreaInsets();
  const { card, fg } = palette(dark);
  if (!target) return null;
  const { message, rect } = target;
  const placement = messageActionsLayout(
    rect,
    { height, top: insets.top, bottom: insets.bottom },
    menuHeight,
  );
  const menuWidth = Math.min(300, width - insets.left - insets.right - 16);
  const run = (action: () => void) => {
    onClose();
    tap();
    action();
  };
  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Dismiss message actions"
          onPress={onClose}
        />
        <View
          onLayout={(event) => setMenuHeight(event.nativeEvent.layout.height)}
          style={[
            styles.menu,
            {
              backgroundColor: card,
              width: menuWidth,
              left: Math.max(
                insets.left + 8,
                Math.min(rect.x, width - insets.right - menuWidth - 8),
              ),
              ...placement,
            },
          ]}
        >
          <ScrollView keyboardShouldPersistTaps="always">
            <View style={styles.emojis}>
              {reactionEmojis.map((emoji) => (
                <Pressable
                  key={emoji}
                  accessibilityRole="button"
                  accessibilityLabel={`React ${emoji}`}
                  onPress={() => run(() => onReact(message.id, emoji))}
                  style={styles.emoji}
                >
                  <Text style={{ fontSize: 27 }}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
            {[
              { label: "Reply", action: () => onReply(message) },
              { label: "Forward", action: () => onForward(message) },
              {
                label: "Delete",
                action: () => confirmDelete(message, onDelete),
              },
            ].map(({ label, action }) => (
              <Pressable
                key={label}
                accessibilityRole="button"
                onPress={() => run(action)}
                style={styles.action}
              >
                <Text
                  style={{
                    color: label === "Delete" ? "#DE6666" : fg,
                    fontSize: 16,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#0004" },
  menu: {
    position: "absolute",
    borderRadius: 18,
    padding: 6,
    elevation: 8,
    overflow: "hidden",
  },
  emojis: { flexDirection: "row", justifyContent: "space-between" },
  emoji: { paddingVertical: 8, paddingHorizontal: 4 },
  action: { paddingHorizontal: 16, paddingVertical: 11 },
});
