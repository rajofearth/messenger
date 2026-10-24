import React from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { StoryDraft } from "./storyComposerModel";
import { moveDraft, removeDraft, toggleDraftCrop } from "./storyComposerModel";
import { StoryMedia } from "./StoryMedia";
import { styles as s } from "./Stories.styles";
import { styles as c } from "./StoryComposer.styles";

type Props = {
  drafts: StoryDraft[];
  index: number;
  onIndex: (index: number) => void;
  onDrafts: (drafts: StoryDraft[]) => void;
  onAddMedia: () => void;
  onPublish: () => void;
  onClose: () => void;
};

export function StoryDraftReview(props: Props) {
  const draft = props.drafts[props.index];
  if (!draft) return null;

  function updateDraft(patch: Partial<StoryDraft>) {
    props.onDrafts(props.drafts.map((item, index) => index === props.index ? { ...item, ...patch } : item));
  }

  function remove() {
    const next = removeDraft(props.drafts, props.index);
    props.onDrafts(next);
    props.onIndex(Math.max(0, Math.min(props.index, next.length - 1)));
  }

  function move(direction: -1 | 1) {
    const nextIndex = Math.max(0, Math.min(props.drafts.length - 1, props.index + direction));
    props.onDrafts(moveDraft(props.drafts, props.index, direction));
    props.onIndex(nextIndex);
  }

  return (
    <SafeAreaView style={s.viewer}>
      <View style={s.flex}>
        <StoryMedia
          key={`${draft.id}-${draft.crop}`}
          uri={draft.uri}
          video={draft.video}
          crop={draft.crop}
          preview
          paused
        />
        <View style={c.composerScrim} pointerEvents="none" />
        <View style={c.composerTop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to choose media" onPress={props.onClose} style={c.composerRoundButton}>
            <Ionicons name="arrow-back" size={23} color="white" />
          </Pressable>
          <Text style={c.composerTitle}>Review story</Text>
          <Text style={c.composerCount}>{props.index + 1} / {props.drafts.length}</Text>
        </View>
        <View style={c.composerTools}>
          <Pressable accessibilityRole="button" accessibilityLabel={draft.crop === "fill" ? "Fit media in frame" : "Fill and crop media"} onPress={() => updateDraft(toggleDraftCrop(draft))} style={c.composerTool}>
            <Ionicons name={draft.crop === "fill" ? "scan-outline" : "crop-outline"} size={21} color="white" />
            <Text style={c.composerToolText}>{draft.crop === "fill" ? "Fit" : "Crop"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Delete this media" onPress={remove} style={c.composerTool}>
            <Ionicons name="trash-outline" size={21} color="white" />
            <Text style={c.composerToolText}>Delete</Text>
          </Pressable>
        </View>
        <View style={c.composerBottom}>
          <View style={c.composerReorderRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Move media left" disabled={props.index === 0} onPress={() => move(-1)} style={[c.composerSmallButton, props.index === 0 && c.composerDisabled]}>
              <Ionicons name="chevron-back" size={18} color="white" />
            </Pressable>
            <Text style={c.composerHint}>Arrange your story</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Move media right" disabled={props.index === props.drafts.length - 1} onPress={() => move(1)} style={[c.composerSmallButton, props.index === props.drafts.length - 1 && c.composerDisabled]}>
              <Ionicons name="chevron-forward" size={18} color="white" />
            </Pressable>
          </View>
          <TextInput
            accessibilityLabel={`Story caption ${props.index + 1}`}
            placeholder="Add a caption"
            placeholderTextColor="#FFFFFFAA"
            value={draft.caption}
            onChangeText={(caption) => updateDraft({ caption })}
            style={c.captionInput}
            maxLength={180}
            multiline
          />
          <View style={c.composerActionsRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Add more media" onPress={props.onAddMedia} style={c.composerAddButton}>
              <Ionicons name="add" size={22} color="white" />
              <Text style={c.composerAddText}>Add media</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Publish ${props.drafts.length} ${props.drafts.length === 1 ? "story" : "stories"}`} onPress={props.onPublish} style={c.share}>
              <Text style={c.shareText}>Share {props.drafts.length > 1 ? `${props.drafts.length} stories` : "story"}</Text>
            </Pressable>
          </View>
          <FlatList
            horizontal
            data={props.drafts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={c.composerThumbs}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <Pressable accessibilityRole="button" accessibilityLabel={`Review media ${index + 1}`} onPress={() => props.onIndex(index)} style={[c.composerThumb, index === props.index && c.composerThumbActive]}>
                <Image source={{ uri: item.uri }} style={c.composerThumbImage} contentFit="cover" />
                {item.video && <Ionicons name="play" size={15} color="white" style={c.composerVideoIcon} />}
                <Text style={c.composerThumbNumber}>{index + 1}</Text>
              </Pressable>
            )}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
