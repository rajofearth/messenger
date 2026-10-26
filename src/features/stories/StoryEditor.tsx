import React, { forwardRef, useImperativeHandle, useState } from "react";
import { Alert, Keyboard } from "react-native";
import type { Story } from "../../domain/data";
import { MediaPicker } from "../media/MediaPicker";
import type { PickedMedia } from "../media/mediaPickerModel";
import { StoryDraftReview } from "./StoryDraftReview";
import {
  appendDrafts,
  MEDIA_STORY_LIMIT,
  type StoryDraft,
} from "./storyComposerModel";

export type StoryEditorHandle = { handleBack: () => boolean };
type Props = {
  avatar: string;
  dark: boolean;
  onShare: (story: Story) => void;
  onClose: () => void;
};

export const StoryEditor = forwardRef<StoryEditorHandle, Props>(function StoryEditor(props, ref) {
  const [drafts, setDrafts] = useState<StoryDraft[]>([]);
  const [index, setIndex] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(true);

  useImperativeHandle(ref, () => ({
    handleBack() {
      if (pickerOpen) return false;
      setPickerOpen(true);
      return true;
    },
  }), [drafts.length, pickerOpen]);

  function addMedia(media: PickedMedia[]) {
    const next = appendDrafts(drafts, media, Date.now().toString(36), MEDIA_STORY_LIMIT);
    const uniqueNew = media.filter((item) => !drafts.some((old) => old.uri === item.uri));
    if (drafts.length + uniqueNew.length > MEDIA_STORY_LIMIT) {
      Alert.alert("Story limit", `You can share up to ${MEDIA_STORY_LIMIT} items. Extra media was not added.`);
    }
    const firstNew = next.findIndex((item) => !drafts.some((old) => old.uri === item.uri));
    setDrafts(next);
    setIndex(firstNew >= 0 ? firstNew : Math.max(0, Math.min(index, next.length - 1)));
    setPickerOpen(false);
  }

  function publish() {
    if (!drafts.length) return;
    Keyboard.dismiss();
    const batch = Date.now().toString(36);
    drafts.forEach((item, itemIndex) =>
      props.onShare({
        id: `story-${batch}-${itemIndex}-${Math.random().toString(36).slice(2, 11)}`,
        ownerId: "self",
        name: "You",
        avatar: props.avatar,
        image: item.uri,
        video: item.video,
        crop: item.crop,
        caption: item.caption.trim(),
        seen: false,
      }),
    );
    props.onClose();
  }

  if (pickerOpen || !drafts.length) {
    return (
      <MediaPicker
        dark={props.dark}
        onPicked={addMedia}
        onClose={props.onClose}
        selectionLimit={Math.max(1, MEDIA_STORY_LIMIT - drafts.length)}
        appendCameraCapture
      />
    );
  }

  return (
    <StoryDraftReview
      drafts={drafts}
      index={index}
      onIndex={setIndex}
      onDrafts={(next) => {
        setDrafts(next);
        if (!next.length) setPickerOpen(true);
      }}
      onAddMedia={() => {
        if (drafts.length < MEDIA_STORY_LIMIT) setPickerOpen(true);
      }}
      canAddMedia={drafts.length < MEDIA_STORY_LIMIT}
      onPublish={publish}
      onClose={() => setPickerOpen(true)}
    />
  );
});
