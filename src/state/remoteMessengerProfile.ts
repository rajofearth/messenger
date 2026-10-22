import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import type { SettingsProfile } from "../features/profile/SettingsPreferences";
import { convexClient } from "../services/convexClient";
import { uploadLocalFile } from "../services/remoteFiles";

type UpdateProfile = (args: {
  name: string;
  username: string;
  bio: string;
  avatarStorageId?: Id<"_storage">;
}) => Promise<unknown>;

/**
 * Persists the editable profile. A newly picked local photo is uploaded once;
 * later saves while the same file is selected reuse the uploaded copy.
 */
export async function saveRemoteProfile(input: {
  next: SettingsProfile;
  remote: { username?: string };
  updateProfile: UpdateProfile;
  uploaded: Map<string, Id<"_storage">>;
}) {
  let avatarStorageId: Id<"_storage"> | undefined;
  const avatar = input.next.avatar;
  const localAvatar =
    avatar?.startsWith("file://") || avatar?.startsWith("content://")
      ? avatar
      : undefined;
  if (localAvatar) {
    avatarStorageId = input.uploaded.get(localAvatar);
    if (!avatarStorageId) {
      avatarStorageId = await uploadLocalFile(
        convexClient,
        api.files.generateUploadUrl,
        api.files.finalizeUpload,
        {
          uri: localAvatar,
          kind: "avatar",
          mimeType: "image/jpeg",
          filename: "avatar.jpg",
        },
      );
      // Remember the storage id, not just "uploaded": a failed profile update
      // retries with the same object instead of dropping the photo.
      input.uploaded.set(localAvatar, avatarStorageId);
    }
  }
  await input.updateProfile({
    name: input.next.name,
    username: input.next.username || input.remote.username || "",
    bio: input.next.bio || "",
    avatarStorageId,
  });
}
