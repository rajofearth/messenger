import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import type { Story } from "../../domain/data";
import { Avatar, IconButton } from "../../ui/primitives";
import { coral, palette } from "../../ui/theme";
import { styles as s } from "./Stories.styles";

export type StoriesProps = {
  stories: Story[];
  index: number | null;
  avatar: string;
  dark: boolean;
  onClose: () => void;
  onSeen: (id: string) => void;
  onDelete: (id: string) => void;
  onShare: (story: Story) => void;
  adding: boolean;
};

export default function Stories(props: StoriesProps) {
  const { stories, index, avatar, dark, adding } = props;
  const [currentIndex, setCurrentIndex] = useState(index);
  const [progress, setProgress] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [picking, setPicking] = useState(false);
  const [closed, setClosed] = useState(false);
  const latest = useRef(props);
  const request = useRef(0);
  const busy = useRef(false);
  latest.current = props;
  const colors = palette(dark);
  const active =
    !adding && currentIndex !== null ? stories[currentIndex] : null;
  const activeId = active?.id;
  const choice = adding && !draft;

  useEffect(() => {
    setCurrentIndex(index);
    setClosed(false);
  }, [index, adding]);

  useEffect(() => {
    setDraft(null);
    setCaption("");
    setPicking(false);
    busy.current = false;
    return () => {
      request.current += 1;
    };
  }, [adding]);

  function close() {
    request.current += 1;
    busy.current = false;
    setPicking(false);
    setClosed(true);
    setDraft(null);
    setCaption("");
    setCurrentIndex(null);
    latest.current.onClose();
  }

  const closeRef = useRef(close);
  closeRef.current = close;

  function advance() {
    if (
      currentIndex !== null &&
      currentIndex + 1 < latest.current.stories.length
    ) {
      setCurrentIndex(currentIndex + 1);
    } else {
      closeRef.current();
    }
  }

  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  useEffect(() => {
    if (!closed && activeId) latest.current.onSeen(activeId);
  }, [activeId, closed]);

  useEffect(() => {
    if (closed || adding || currentIndex === null) return;
    if (!activeId) {
      closeRef.current();
      return;
    }
    setProgress(0);
    const started = Date.now();
    const tick = setInterval(() => {
      setProgress(Math.min(1, (Date.now() - started) / 5000));
    }, 50);
    const timer = setTimeout(() => advanceRef.current(), 5000);
    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
  }, [activeId, currentIndex, adding, closed]);

  async function pick(camera: boolean) {
    if (busy.current) return;
    busy.current = true;
    setPicking(true);
    const token = ++request.current;
    try {
      const permission = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (token !== request.current) return;
      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          `Allow ${camera ? "camera" : "photo library"} access in your device settings to add a story.`,
        );
        return;
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        quality: 0.85,
        allowsEditing: true,
        aspect: [9, 16],
      };
      const result = camera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (token !== request.current) return;
      if (!result.canceled && result.assets[0]?.uri) {
        setCaption("");
        setDraft(result.assets[0].uri);
      }
    } catch {
      if (token === request.current) {
        Alert.alert(
          camera ? "Couldn't open camera" : "Couldn't open photos",
          "Please try again on a device with a camera or photo library.",
        );
      }
    } finally {
      if (token === request.current) {
        busy.current = false;
        setPicking(false);
      }
    }
  }

  function share() {
    if (!draft || closed) return;
    latest.current.onShare({
      id: `story-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`,
      name: "You",
      avatar,
      image: draft,
      caption: caption.trim(),
      seen: false,
    });
    close();
  }

  return (
    <Modal
      visible={!closed && (adding || index !== null)}
      transparent={choice}
      presentationStyle={choice ? "overFullScreen" : "fullScreen"}
      animationType="fade"
      onRequestClose={close}
    >
      {choice ? (
        <View style={s.sheetWrap}>
          <Pressable
            style={s.scrim}
            accessibilityRole="button"
            accessibilityLabel="Cancel story"
            onPress={close}
          />
          <SafeAreaView
            edges={["bottom", "left", "right"]}
            style={[s.sheet, { backgroundColor: colors.bg }]}
          >
            <View style={s.header}>
              <Text style={[s.sheetTitle, { color: colors.fg }]}>
                Add story
              </Text>
              <IconButton
                name="close"
                label="Cancel story"
                color={colors.fg}
                onPress={close}
              />
            </View>
            {([false, true] as const).map((camera) => (
              <Pressable
                key={String(camera)}
                accessibilityRole="button"
                accessibilityState={{ disabled: picking }}
                disabled={picking}
                onPress={() => void pick(camera)}
                style={[s.choice, { opacity: picking ? 0.5 : 1 }]}
              >
                <Ionicons
                  name={camera ? "camera-outline" : "images-outline"}
                  size={24}
                  color={coral}
                />
                <Text style={[s.choiceText, { color: colors.fg }]}>
                  {camera ? "Camera" : "Photo library"}
                </Text>
              </Pressable>
            ))}
          </SafeAreaView>
        </View>
      ) : (
        <SafeAreaView style={s.viewer}>
          {(draft || active) && (
            <>
              <Image
                source={{ uri: draft ?? active!.image }}
                style={s.image}
                resizeMode="cover"
              />
              <LinearGradient
                colors={["#00000099", "transparent", "#000000AA"]}
                style={s.image}
                pointerEvents="none"
              />
              <KeyboardAvoidingView
                style={s.flex}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
              >
                <View style={s.top}>
                  {!draft && (
                    <View style={s.tracks}>
                      {stories.map((story, i) => (
                        <View key={story.id} style={s.track}>
                          <View
                            style={[
                              s.fill,
                              {
                                width: `${i < currentIndex! ? 100 : i === currentIndex ? progress * 100 : 0}%`,
                              },
                            ]}
                          />
                        </View>
                      ))}
                    </View>
                  )}
                  <View style={s.header}>
                    <Avatar uri={draft ? avatar : active!.avatar} size={38} />
                    <Text style={s.name}>{draft ? "You" : active?.name}</Text>
                    {!draft && active?.name === "You" && (
                      <IconButton
                        name="trash-outline"
                        label="Delete your story"
                        color="white"
                        onPress={() => {
                          latest.current.onDelete(active.id);
                          close();
                        }}
                      />
                    )}
                    <IconButton
                      name="close"
                      label="Close story"
                      color="white"
                      onPress={close}
                    />
                  </View>
                </View>
                {draft ? (
                  <View style={s.flex} />
                ) : (
                  <View style={s.navigation}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Previous story"
                      style={s.flex}
                      onPress={() =>
                        setCurrentIndex((i) =>
                          i === null ? null : Math.max(0, i - 1),
                        )
                      }
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Next story"
                      style={s.next}
                      onPress={advance}
                    />
                  </View>
                )}
                <View style={s.bottom}>
                  {draft ? (
                    <>
                      <TextInput
                        accessibilityLabel="Story caption"
                        placeholder="Add a caption"
                        placeholderTextColor="#FFFFFFAA"
                        value={caption}
                        onChangeText={setCaption}
                        style={s.captionInput}
                        maxLength={180}
                        multiline
                      />
                      <Pressable
                        accessibilityRole="button"
                        onPress={share}
                        style={s.share}
                      >
                        <Text style={s.shareText}>Share story</Text>
                      </Pressable>
                    </>
                  ) : (
                    !!active?.caption && (
                      <Text style={s.caption}>{active.caption}</Text>
                    )
                  )}
                </View>
              </KeyboardAvoidingView>
            </>
          )}
        </SafeAreaView>
      )}
    </Modal>
  );
}
