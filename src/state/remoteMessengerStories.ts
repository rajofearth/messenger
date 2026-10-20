import type { Dispatch, SetStateAction } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { Story } from "../domain/data";

type Args = {
  setStories: Dispatch<SetStateAction<Story[]>>;
  markSeen: (args: { storyId: Id<"stories"> }) => Promise<unknown>;
  remove: (args: { storyId: Id<"stories"> }) => Promise<unknown>;
  share: (story: Story) => void;
};

/** Story mutations update the list immediately and reconcile with Convex. */
export function createStoryActions({
  setStories,
  markSeen,
  remove,
  share,
}: Args) {
  function markStorySeen(id: string) {
    setStories((current) =>
      current.map((story) =>
        story.id === id ? { ...story, seen: true } : story,
      ),
    );
    void markSeen({ storyId: id as Id<"stories"> }).catch(() => {});
  }

  function deleteStory(id: string) {
    setStories((current) => current.filter((story) => story.id !== id));
    void remove({ storyId: id as Id<"stories"> }).catch(() => {});
  }

  function shareStory(story: Story) {
    share(story);
  }

  return { markStorySeen, deleteStory, shareStory };
}
