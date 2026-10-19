import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Chat } from "../../domain/data";
import { coral, palette } from "../../ui/theme";

export type ChatActionTarget = { chat: Chat; x: number; y: number };

type Props = {
  target: ChatActionTarget | null;
  dark: boolean;
  onClose: () => void;
  onProfile: (chat: Chat) => void;
  onToggleMute: (chat: Chat) => void;
  onTogglePin: (chat: Chat) => void;
  onDeleteChat: (chat: Chat) => void;
};

export default function ChatListActions({
  target,
  dark,
  onClose,
  onProfile,
  onToggleMute,
  onTogglePin,
  onDeleteChat,
}: Props) {
  const colors = palette(dark);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setConfirming(false), [target]);
  if (!target) return null;
  const { chat, x, y } = target;
  const menuWidth = Math.min(280, width - 24);
  const menuHeight = confirming ? 250 : 272;
  const left = Math.max(
    12,
    Math.min(x - menuWidth / 2, width - menuWidth - 12),
  );
  const top = Math.max(
    insets.top + 12,
    Math.min(y + 8, height - insets.bottom - menuHeight - 12),
  );

  function run(action: (chat: Chat) => void) {
    onClose();
    action(chat);
  }

  function option(
    label: string,
    icon: React.ComponentProps<typeof Ionicons>["name"],
    action: () => void,
    destructive = false,
  ) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={action}
        style={({ pressed }) => [
          s.option,
          pressed && { backgroundColor: colors.line },
        ]}
      >
        <Ionicons
          name={icon}
          size={19}
          color={destructive ? coral : colors.fg}
        />
        <Text style={[s.label, { color: destructive ? coral : colors.fg }]}>
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={s.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Dismiss conversation actions"
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={[
            s.menu,
            {
              top,
              left,
              width: menuWidth,
              backgroundColor: colors.card,
              borderColor: colors.line,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            accessibilityRole="header"
            style={[s.title, { color: colors.fg }]}
          >
            {chat.name}
          </Text>
          {confirming ? (
            <>
              <Text style={[s.message, { color: colors.muted }]}>
                Delete this conversation? This cannot be undone.
              </Text>
              {option("Cancel", "close-outline", () => setConfirming(false))}
              {option(
                "Delete conversation",
                "trash-outline",
                () => run(onDeleteChat),
                true,
              )}
            </>
          ) : (
            <>
              {option(
                chat.group ? "Group details" : "Profile",
                chat.group ? "people-outline" : "person-outline",
                () => run(onProfile),
              )}
              {option(
                chat.muted ? "Unmute" : "Mute",
                chat.muted
                  ? "notifications-outline"
                  : "notifications-off-outline",
                () => run(onToggleMute),
              )}
              {option(chat.pinned ? "Unpin" : "Pin", "pin-outline", () =>
                run(onTogglePin),
              )}
              {option(
                "Delete conversation",
                "trash-outline",
                () => setConfirming(true),
                true,
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.2)" },
  menu: {
    position: "absolute",
    borderRadius: 18,
    borderWidth: 1,
    padding: 8,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
  },
  title: { fontFamily: "DMSans_600SemiBold", fontSize: 15, padding: 12 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  label: { flexShrink: 1, fontFamily: "DMSans_500Medium", fontSize: 14 },
  message: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    lineHeight: 21,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
});
