import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { type IconName, tap } from "./primitives";
import { coral, palette } from "./theme";

type Props = {
  dark: boolean;
  onNewConversation: () => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
};

export default function QuickActions({
  dark,
  onNewConversation,
  onVoiceCall,
  onVideoCall,
}: Props) {
  const colors = palette(dark);
  const { width, height } = useWindowDimensions();
  const anchor = useRef<View>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    Animated.timing(progress, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
    return () => progress.stopAnimation();
  }, [visible, progress]);

  useEffect(() => {
    setVisible(false);
    progress.setValue(0);
    closing.current = false;
  }, [width, height, progress]);

  function open() {
    tap();
    anchor.current?.measureInWindow((x, y) => {
      setPosition({ x, y });
      closing.current = false;
      setVisible(true);
    });
  }

  function dismiss(onSelect?: () => void) {
    if (closing.current) return;
    closing.current = true;
    tap();
    Animated.timing(progress, {
      toValue: 0,
      duration: 140,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setVisible(false);
      closing.current = false;
      if (onSelect) requestAnimationFrame(onSelect);
    });
  }

  const actions: { label: string; icon: IconName; onSelect: () => void }[] = [
    {
      label: "New conversation",
      icon: "chatbubble-outline",
      onSelect: onNewConversation,
    },
    { label: "Voice call", icon: "call-outline", onSelect: onVoiceCall },
    { label: "Video call", icon: "videocam-outline", onSelect: onVideoCall },
  ];
  const rotation = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "45deg"],
  });
  const plus = (
    <Animated.View style={{ transform: [{ rotate: rotation }] }}>
      <Ionicons name="add" size={29} color={colors.onCoral} />
    </Animated.View>
  );

  return (
    <>
      <View ref={anchor} collapsable={false} style={s.anchor}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open quick actions"
          accessibilityState={{ expanded: visible }}
          onPress={open}
          style={s.fab}
        >
          {plus}
        </Pressable>
      </View>
      <Modal
        visible={visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => dismiss()}
      >
        <View
          style={s.overlay}
          accessibilityViewIsModal
          onAccessibilityEscape={() => dismiss()}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Dismiss quick actions"
            onPress={() => dismiss()}
          />
          <Animated.View
            style={[
              s.popup,
              {
                right: Math.max(16, width - position.x - 58),
                bottom: Math.max(86, height - position.y + 12),
                maxWidth: width - 32,
                backgroundColor: colors.card,
                borderColor: colors.line,
                opacity: progress,
                transform: [
                  {
                    scale: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.88, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            {actions.map(({ label, icon, onSelect }) => (
              <Pressable
                key={label}
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => dismiss(onSelect)}
                style={({ pressed }) => [
                  s.action,
                  { backgroundColor: pressed ? colors.tint : "transparent" },
                ]}
              >
                <View style={[s.icon, { backgroundColor: colors.tint }]}>
                  <Ionicons name={icon} size={21} color={colors.coralInk} />
                </View>
                <Text style={[s.label, { color: colors.fg }]}>{label}</Text>
              </Pressable>
            ))}
          </Animated.View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close quick actions"
            accessibilityState={{ expanded: true }}
            onPress={() => dismiss()}
            style={[
              s.fab,
              { position: "absolute", left: position.x, top: position.y },
            ]}
          >
            {plus}
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  anchor: { position: "absolute", right: 25, bottom: 24 },
  overlay: { flex: 1, backgroundColor: "transparent" },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: coral,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#B76F5B",
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  popup: {
    position: "absolute",
    width: 254,
    padding: 8,
    borderRadius: 22,
    borderWidth: 1,
    elevation: 8,
    shadowColor: "#28231D",
    shadowOpacity: 0.13,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    transformOrigin: "bottom right",
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 15,
    minHeight: 56,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontFamily: "DMSans_500Medium", fontSize: 15, flexShrink: 1 },
});
