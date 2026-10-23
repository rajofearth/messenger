import React, { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Story } from "../../domain/data";
import { Avatar, IconButton } from "../../ui/primitives";
import { StoryPicker } from "./StoryPicker";
import type { PickedStoryMedia } from "./storyPickerModel";
import { StoryMedia } from "./StoryMedia";
import { styles as s } from "./Stories.styles";

type Draft = { uri: string; video: boolean; caption: string };
type Props = {
  avatar: string;
  dark: boolean;
  onShare: (story: Story) => void;
  onClose: () => void;
};
export function StoryEditor(props: Props) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [index, setIndex] = useState(0);
  const [keyboard, setKeyboard] = useState(false);
  const sharing = useRef(false);
  const draft = drafts[index];
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboard(true),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboard(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  function handlePicked(media: PickedStoryMedia[]) {
    setDrafts(
      media.map((asset) => ({
        uri: asset.uri,
        video: asset.video,
        caption: "",
      })),
    );
    setIndex(0);
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
      <StoryPicker
        dark={props.dark}
        onPicked={handlePicked}
        onClose={props.onClose}
      />
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
