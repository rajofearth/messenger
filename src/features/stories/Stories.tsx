import React, { useState } from "react";
import { Modal } from "react-native";
import type { Story } from "../../domain/data";
import { groupStories } from "../../domain/stories";
import { StoryViewer } from "./StoryViewer";
import { StoryEditor } from "./StoryEditor";

export type StoriesProps = {
  stories: Story[];
  /** Index into groupStories(stories), not the flat story array. */
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
  if (!props.adding && props.index === null) return null;
  return (
    <StorySession
      key={props.adding ? "adding" : `owner-${props.index}`}
      {...props}
    />
  );
}

function StorySession(props: StoriesProps) {
  const [closed, setClosed] = useState(false);
  function close() {
    setClosed(true);
    props.onClose();
  }
  if (closed) return null;
  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={close}
    >
      {props.adding ? (
        <StoryEditor
          avatar={props.avatar}
          dark={props.dark}
          onShare={props.onShare}
          onClose={close}
        />
      ) : (
        <StoryViewer
          groups={groupStories(props.stories)}
          initialIndex={props.index ?? 0}
          onSeen={props.onSeen}
          onDelete={props.onDelete}
          onClose={close}
        />
      )}
    </Modal>
  );
}
