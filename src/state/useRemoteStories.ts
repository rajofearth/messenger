import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Story } from "../domain/data";
import { mergeStoryUploads } from "../domain/stories";
import { uploadAndCreateStory } from "./remoteMessengerUploads";

type Args = {
  stories: Story[];
  setStories: Dispatch<SetStateAction<Story[]>>;
};

/**
 * Owns story actions and the local upload queue. A local row stays in the
 * visible list until the server snapshot returns the same id, so even a slow
 * third video remains playable while it uploads.
 */
export function useRemoteStories({ stories, setStories }: Args) {
  const storySeen = useMutation(api.stories.markSeen);
  const storyDelete = useMutation(api.stories.remove);
  const storyCreate = useMutation(api.stories.create);
  const [uploads, setUploads] = useState<Story[]>([]);
  const uploadsRef = useRef(uploads);
  const cancelled = useRef(new Set<string>());
  uploadsRef.current = uploads;

  // Depends on the uploads too: `stories.create` can resolve after the server
  // snapshot that already contains the new id, so replacing the local id is
  // the change that confirms the row, not a later stories render.
  useEffect(() => {
    if (!uploads.length) return;
    const confirmed = new Set(stories.map((story) => story.id));
    setUploads((current) => {
      const next = current.filter((story) => !confirmed.has(story.id));
      return next.length === current.length ? current : next;
    });
  }, [stories, uploads]);

  const visibleStories = useMemo(
    () => mergeStoryUploads(stories, uploads),
    [stories, uploads],
  );

  function markStorySeen(id: string) {
    if (uploadsRef.current.some((story) => story.id === id)) return;
    setStories((current) =>
      current.map((story) =>
        story.id === id ? { ...story, seen: true } : story,
      ),
    );
    void storySeen({ storyId: id as Id<"stories"> }).catch(() => {});
  }

  function updateUpload(
    id: string,
    patch: Partial<Pick<Story, "id" | "uploadStatus" | "uploadProgress">>,
  ) {
    setUploads((current) =>
      current.map((story) => (story.id === id ? { ...story, ...patch } : story)),
    );
  }

  function startUpload(story: Story) {
    const localId = story.id;
    void uploadAndCreateStory(story, storyCreate, (progress) =>
      updateUpload(localId, { uploadProgress: progress }),
    )
      .then((serverId) => {
        if (cancelled.current.delete(localId)) {
          setUploads((current) =>
            current.filter((item) => item.id !== localId),
          );
          void storyDelete({ storyId: serverId }).catch(() => {});
          return;
        }
        updateUpload(localId, {
          id: serverId,
          uploadStatus: "uploaded",
          uploadProgress: 1,
        });
      })
      .catch(() => {
        cancelled.current.delete(localId);
        updateUpload(localId, { uploadStatus: "failed" });
      });
  }

  function deleteStory(id: string) {
    const pending = uploadsRef.current.find((story) => story.id === id);
    if (pending && pending.uploadStatus !== "uploaded")
      cancelled.current.add(id);
    setUploads((current) => current.filter((story) => story.id !== id));
    setStories((current) => current.filter((story) => story.id !== id));
    if (pending && pending.uploadStatus !== "uploaded") return;
    void storyDelete({ storyId: id as Id<"stories"> }).catch(() => {});
  }

  function shareStory(story: Story) {
    const local: Story = {
      ...story,
      ownerId: "self",
      name: "You",
      createdAt: Date.now(),
      uploadStatus: "uploading",
      uploadProgress: 0,
    };
    setUploads((current) => [...current, local]);
    startUpload(local);
  }

  function retryStory(id: string) {
    const pending = uploadsRef.current.find((story) => story.id === id);
    if (!pending || pending.uploadStatus !== "failed") return;
    const retry: Story = {
      ...pending,
      uploadStatus: "uploading",
      uploadProgress: 0,
    };
    setUploads((current) =>
      current.map((story) => (story.id === id ? retry : story)),
    );
    startUpload(retry);
  }

  return {
    stories: visibleStories,
    markStorySeen,
    deleteStory,
    shareStory,
    retryStory,
  };
}
