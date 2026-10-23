import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { StoryView } from "../domain/data";

/**
 * Loads the owner-only audience for one of the current user's stories.
 *
 * Local uploads use a synthetic id until `stories.create` returns the server
 * row, so callers pass null for those instead of sending an invalid argument.
 */
export function useStoryViewers(storyId: string | null) {
  return useQuery(
    api.stories.views,
    storyId ? { storyId: storyId as Id<"stories"> } : "skip",
  ) as StoryView[] | undefined;
}
