import React, { useState } from "react";
import { Keyboard } from "react-native";
import type { Story } from "../../domain/data";
import { MediaPicker } from "../media/MediaPicker";
import type { PickedMedia } from "../media/mediaPickerModel";
import { StoryDraftReview } from "./StoryDraftReview";
import {
  appendDrafts,
  type StoryDraft,
} from "./storyComposerModel";

type Props = {
  avatar: string;
  dark: boolean;
  onShare: (story: Story) => void;
  onClose: () => void;
};

export function StoryEditor(props: Props) {
  const [drafts, setDrafts] = useState<StoryDraft[]>([]);
  const [index, setIndex] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(true);

  function addMedia(media: PickedMedia[]) {
    setDrafts((current) => {
      const next = appendDrafts(current, media, Date.now().toString(36));
      setIndex(current.length ? current.length : 0);
      return next;
    });
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
      onAddMedia={() => setPickerOpen(true)}
      onPublish={publish}
      onClose={() => setPickerOpen(true)}
    />
  );
}
