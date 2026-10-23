import type { Story } from "./data";

export type StoryGroup = {
  id: string;
  name: string;
  avatar: string;
  items: Story[];
  seen: boolean;
};

/**
 * Own stories come back from the server with the account id, but the ring and
 * viewer group by "self" so they stay pinned to the current profile.
 */
export function markOwnStories(
  stories: Story[],
  selfId: string | null | undefined,
): Story[] {
  if (!selfId) return stories;
  let changed = false;
  const next = stories.map((story) => {
    if (story.ownerId !== selfId) return story;
    changed = true;
    return { ...story, ownerId: "self", name: "You" };
  });
  return changed ? next : stories;
}

/**
 * Keeps local uploads in the story list until the server snapshot contains the
 * same story, so a third video is visible while its upload is still running.
 */
export function mergeStoryUploads(server: Story[], uploads: Story[]): Story[] {
  if (!uploads.length) return server;
  const confirmed = new Set(server.map((story) => story.id));
  const pending = uploads.filter((story) => !confirmed.has(story.id));
  return pending.length ? [...server, ...pending] : server;
}

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
