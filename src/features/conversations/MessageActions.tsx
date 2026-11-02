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
import { palette, radius, space } from "../../ui/theme";
import { tap } from "../../ui/primitives";
import { deleteOptions, messageSummary } from "./conversationModel";

export type MessageRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type ActionTarget = { message: Message; rect: MessageRect };
export const reactionEmojis = ["🤍", "😂", "😍", "👍", "🔥"];

export function confirmDelete(
  message: Message,
  onDelete: (id: string, everyone: boolean) => void,
) {
  Alert.alert(
    "Delete message?",
    message.mine
      ? "Delete this message for everyone."
      : "You can delete it for yourself; only the sender can delete it for everyone.",
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
  onSave,
  onDelete,
  onRetry,
}: {
  target: ActionTarget | null;
  dark: boolean;
  onClose: () => void;
  onReact: (id: string, emoji: string) => void;
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onSave?: (message: Message) => void;
  onDelete: (id: string, everyone: boolean) => void;
  onRetry?: (messageId: string) => void;
}) {
  const { width, height } = useWindowDimensions();
  const [menuHeight, setMenuHeight] = useState(200);
  const insets = useSafeAreaInsets();
  const { card, fg, muted, danger, scrim, line } = palette(dark);
  if (!target) return null;
  const { message, rect } = target;
  const summary = messageSummary(message);
  // Reactions, replies and forwards all address the server message id; a
  // local-only bubble has no such id until its send is confirmed.
  const serverMessage = !message.status;
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
      <View style={[styles.overlay, { backgroundColor: scrim }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Dismiss message actions"
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          onLayout={(event) => setMenuHeight(event.nativeEvent.layout.height)}
          style={[
            styles.menu,
            {
              backgroundColor: card,
              borderColor: line,
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
            <View
              accessibilityRole="header"
              style={[styles.heading, { borderBottomColor: line }]}
            >
              <Text style={[styles.headingLabel, { color: fg }]}>Message actions</Text>
              <Text numberOfLines={2} style={[styles.headingSummary, { color: muted }]}>
                {summary}
              </Text>
            </View>
            {serverMessage ? (
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
            ) : null}
            {[
              ...(onRetry && message.status === "failed"
                ? [
                    {
                      label: "Retry sending",
                      action: () => onRetry(message.id),
                    },
                  ]
                : []),
              ...(serverMessage
                ? [
                    { label: "Reply", action: () => onReply(message) },
                    { label: "Forward", action: () => onForward(message) },
                  ]
                : []),
              ...(onSave && message.uri && (message.kind === "image" || message.kind === "video")
                ? [
                    {
                      label: "Save to gallery",
                      action: () => onSave(message),
                    },
                  ]
                : []),
              {
                label: "Delete",
                action: () => confirmDelete(message, onDelete),
              },
            ].map(({ label, action }) => (
              <Pressable
                key={label}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${summary}`}
                onPress={() => run(action)}
                style={({ pressed }) => [styles.action, { opacity: pressed ? 0.55 : 1 }]}
              >
                <Text
                  style={{
                    color: label === "Delete" ? danger : fg,
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
  overlay: { flex: 1 },
  menu: {
    position: "absolute",
    borderRadius: radius.control,
    padding: space.xs,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  emojis: { flexDirection: "row", justifyContent: "space-between" },
  emoji: {
    minWidth: 44,
    minHeight: 44,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  heading: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: space.xs,
  },
  headingLabel: { fontFamily: "sans-serif-medium", fontSize: 13, lineHeight: 18 },
  headingSummary: { fontFamily: "sans-serif", fontSize: 12, lineHeight: 17, marginTop: 2 },
  action: { minHeight: 48, justifyContent: "center", paddingHorizontal: space.lg, paddingVertical: space.sm },
});
