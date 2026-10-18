import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { requestRecordingPermissionsAsync } from "expo-audio";
import type { Story } from "../../domain/data";
import { Avatar, IconButton } from "../../ui/primitives";
import { coral, palette } from "../../ui/theme";
import { StoryMedia } from "./StoryMedia";
import { styles as s } from "./Stories.styles";

type Draft = { uri: string; video: boolean; caption: string };
type Props = {
  avatar: string;
  dark: boolean;
  onShare: (story: Story) => void;
  onClose: () => void;
};
type Source = "library" | "photo" | "video";

export function StoryEditor(props: Props) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [index, setIndex] = useState(0);
  const [picking, setPicking] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const busy = useRef(false);
  const sharing = useRef(false);
  const mounted = useRef(true);
  const request = useRef(0);
  const draft = drafts[index];
  const colors = palette(props.dark);
  useEffect(() => {
    mounted.current = true;
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboard(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboard(false),
    );
    return () => {
      mounted.current = false;
      request.current += 1;
      show.remove();
      hide.remove();
    };
  }, []);

  async function pick(source: Source) {
    if (busy.current) return;
    busy.current = true;
    setPicking(true);
    const token = ++request.current;
    const valid = () => mounted.current && request.current === token;
    try {
      const camera = source !== "library";
      const permission = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!valid()) return;
      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          `Allow ${camera ? "camera" : "photo library"} access in device settings to add a story.`,
        );
        return;
      }
      if (source === "video") {
        // Request access only. Do not enable recording audio mode for playback.
        const microphone = await requestRecordingPermissionsAsync();
        if (!valid()) return;
        if (!microphone.granted) {
          Alert.alert(
            "Microphone permission needed",
            "Allow microphone access in device settings to record a video with sound.",
          );
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes:
          source === "photo"
            ? ["images"]
            : source === "video"
              ? ["videos"]
              : ["images", "videos"],
        allowsEditing: false,
        quality: 0.85,
        ...(camera
          ? { videoMaxDuration: 60 }
          : { allowsMultipleSelection: true, orderedSelection: true }),
      };
      const result = camera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (!valid() || result.canceled) return;
      setDrafts(
        result.assets
          .filter((asset) => !!asset.uri)
          .map((asset) => ({
            uri: asset.uri,
            video: asset.type === "video",
            caption: "",
          })),
      );
      setIndex(0);
    } catch (error) {
      if (valid())
        Alert.alert(
          "Couldn't open media",
          error instanceof Error
            ? error.message
            : "Please try again on a device with a camera or photo library.",
        );
    } finally {
      if (valid()) {
        busy.current = false;
        setPicking(false);
      }
    }
  }

  function share() {
    if (!drafts.length || sharing.current) return;
    sharing.current = true;
    Keyboard.dismiss();
    const batch = Date.now().toString(36);
    drafts.forEach((item, i) =>
      props.onShare({
        id: `story-${batch}-${i}-${Math.random().toString(36).slice(2, 11)}`,
        ownerId: "self",
        name: "You",
        avatar: props.avatar,
        image: item.uri,
        video: item.video,
        caption: item.caption.trim(),
        seen: false,
      }),
    );
    props.onClose();
  }

  if (!draft)
    return (
      <View style={[s.sheetWrap, { backgroundColor: colors.bg }]}>
        <SafeAreaView
          edges={["bottom", "left", "right"]}
          style={[s.sheet, { backgroundColor: colors.bg }]}
        >
          <View style={s.header}>
            <Text style={[s.sheetTitle, { color: colors.fg }]}>Add story</Text>
            <IconButton
              name="close"
              label="Cancel story"
              color={colors.fg}
              onPress={props.onClose}
            />
          </View>
          {(
            [
              ["library", "images-outline", "Photos and videos"],
              ["photo", "camera-outline", "Take photo"],
              ["video", "videocam-outline", "Record video"],
            ] as const
          ).map(([source, icon, label]) => (
            <Pressable
              key={source}
              accessibilityRole="button"
              accessibilityState={{ disabled: picking }}
              disabled={picking}
              onPress={() => void pick(source)}
              style={[s.choice, { opacity: picking ? 0.5 : 1 }]}
            >
              <Ionicons name={icon} size={24} color={coral} />
              <Text style={[s.choiceText, { color: colors.fg }]}>{label}</Text>
            </Pressable>
          ))}
          {picking && <Text style={{ color: colors.fg }}>Opening media…</Text>}
        </SafeAreaView>
      </View>
    );

  return (
    <SafeAreaView style={s.viewer}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <StoryMedia
          key={`${index}-${draft.uri}`}
          uri={draft.uri}
          video={draft.video}
          preview
          paused={keyboard}
        />
        <View style={s.top}>
          <View style={s.header}>
            <Avatar uri={props.avatar} size={38} />
            <Text style={s.name}>
              You · {index + 1} / {drafts.length}
            </Text>
            <IconButton
              name="close"
              label="Cancel story"
              color="white"
              onPress={props.onClose}
            />
          </View>
        </View>
        <Pressable
          style={s.flex}
          accessibilityLabel="Dismiss keyboard"
          onPress={Keyboard.dismiss}
        />
        <View style={s.bottom}>
          {drafts.length > 1 && (
            <View style={s.header}>
              <IconButton
                name="chevron-back"
                label="Previous selected asset"
                color="white"
                onPress={() => {
                  Keyboard.dismiss();
                  setIndex(Math.max(0, index - 1));
                }}
              />
              <Text style={s.name}>Caption each photo or video</Text>
              <IconButton
                name="chevron-forward"
                label="Next selected asset"
                color="white"
                onPress={() => {
                  Keyboard.dismiss();
                  setIndex(Math.min(drafts.length - 1, index + 1));
                }}
              />
            </View>
          )}
          <TextInput
            accessibilityLabel={`Story caption ${index + 1}`}
            placeholder="Add a caption"
            placeholderTextColor="#FFFFFFAA"
            value={draft.caption}
            onChangeText={(caption) =>
              setDrafts((items) =>
                items.map((item, i) =>
                  i === index ? { ...item, caption } : item,
                ),
              )
            }
            style={s.captionInput}
            maxLength={180}
            multiline
          />
          <Pressable accessibilityRole="button" onPress={share} style={s.share}>
            <Text style={s.shareText}>
              {drafts.length > 1
                ? `Share ${drafts.length} stories`
                : "Share story"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
