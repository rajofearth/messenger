import type { Story } from "./data";

export type StoryGroup = {
  id: string;
  name: string;
  avatar: string;
  items: Story[];
  seen: boolean;
};

// Array order is upload order. Callers should append new uploads, not sort here.
export function groupStories(stories: Story[]): StoryGroup[] {
  const groups = new Map<string, StoryGroup>();
  for (const story of stories) {
    const id = story.ownerId ?? (story.name === "You" ? "self" : story.avatar);
    const group = groups.get(id);
    if (group) {
      group.items.push(story);
      group.seen = group.seen && story.seen;
    } else {
      groups.set(id, {
        id,
        name: story.name,
        avatar: story.avatar,
        items: [story],
        seen: story.seen,
      });
    }
  }
  return [...groups.values()];
}
