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
import { palette, radius, space } from "./theme";

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
      <Ionicons name="add" size={29} color={colors.bg} />
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
          style={[s.fab, { backgroundColor: colors.fg }]}
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
                right: Math.max(space.lg, width - position.x - 56),
                bottom: Math.max(88, height - position.y + space.md),
                maxWidth: width - space.xxxl,
                backgroundColor: colors.card,
                borderColor: colors.line,
                shadowColor: colors.shadow,
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
                  <Ionicons name={icon} size={21} color={colors.fg} />
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
              { backgroundColor: colors.fg },
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
  anchor: { position: "absolute", right: space.xxl, bottom: space.xxl },
  overlay: { flex: 1, backgroundColor: "transparent" },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  popup: {
    position: "absolute",
    width: 256,
    padding: space.sm,
    borderRadius: radius.sheet,
    borderWidth: 1,
    elevation: 4,
    shadowOpacity: 0.13,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    transformOrigin: "bottom right",
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.control,
    minHeight: 56,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: "sans-serif-medium",
    fontSize: 15,
    flexShrink: 1,
  },
});
