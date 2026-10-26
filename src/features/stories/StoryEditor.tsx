import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Alert, Keyboard } from "react-native";
import type { Story } from "../../domain/data";
import {
  discardTemporaryMedia,
  pruneTemporaryMedia,
} from "../../services/mediaCache";
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
  const draftsRef = useRef<StoryDraft[]>([]);
  const published = useRef(false);
  const [index, setIndex] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(true);

  draftsRef.current = drafts;
  useEffect(() => {
    void pruneTemporaryMedia();
    return () => {
      if (published.current) return;
      for (const draft of draftsRef.current) discardTemporaryMedia(draft.uri);
    };
  }, []);

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
    const retained = new Set(next.map((item) => item.uri));
    for (const item of media) {
      if (!retained.has(item.uri)) discardTemporaryMedia(item.uri, [...retained]);
    }
    const firstNew = next.findIndex((item) => !drafts.some((old) => old.uri === item.uri));
    draftsRef.current = next;
    setDrafts(next);
    setIndex(firstNew >= 0 ? firstNew : Math.max(0, Math.min(index, next.length - 1)));
    setPickerOpen(false);
  }

  function abandon() {
    for (const draft of draftsRef.current) discardTemporaryMedia(draft.uri);
    draftsRef.current = [];
    setDrafts([]);
    props.onClose();
  }

  function updateDrafts(next: StoryDraft[]) {
    const retained = new Set(next.map((item) => item.uri));
    for (const draft of draftsRef.current) {
      if (!retained.has(draft.uri)) discardTemporaryMedia(draft.uri, [...retained]);
    }
    draftsRef.current = next;
    setDrafts(next);
    if (!next.length) setPickerOpen(true);
  }

  function publish() {
    if (!drafts.length) return;
    published.current = true;
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
        onClose={abandon}
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
      onDrafts={updateDrafts}
      onAddMedia={() => {
        if (drafts.length < MEDIA_STORY_LIMIT) setPickerOpen(true);
      }}
      canAddMedia={drafts.length < MEDIA_STORY_LIMIT}
      onPublish={publish}
      onClose={() => setPickerOpen(true)}
    />
  );
});
