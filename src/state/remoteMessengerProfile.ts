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

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "";
}

/** Keeps the avatar's real format instead of claiming every pick is a JPEG. */
function avatarType(input: { mimeType?: string; filename?: string }) {
  const reported = input.mimeType?.split(";")[0].trim().toLowerCase();
  if (reported && /^image\/[a-z0-9][a-z0-9.+-]*$/.test(reported))
    return reported;
  const extension = input.filename?.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "heic" || extension === "heif") return "image/heic";
  return "image/jpeg";
}

function avatarUploadName(input: { mimeType?: string; filename?: string }) {
  const type = avatarType(input);
  if (type === "image/png") return "avatar.png";
  if (type === "image/webp") return "avatar.webp";
  if (type === "image/gif") return "avatar.gif";
  if (type === "image/heic") return "avatar.heic";
  const extension = input.filename?.split(".").pop()?.toLowerCase();
  if (extension && /^[a-z0-9]{2,5}$/.test(extension)) {
    return input.filename!;
  }
  return "avatar.jpg";
}

/**
 * Persists the editable profile. A newly picked local photo is uploaded once;
 * later saves while the same file is selected reuse the uploaded copy.
 */
export async function saveRemoteProfile(input: {
  next: SettingsProfile;
  remote: { username?: string };
  updateProfile: UpdateProfile;
  uploaded: Map<string, Id<"_storage">>;
  avatarFile?: { mimeType?: string; filename?: string };
  /** First sign-in can race the profile row; create it and retry once. */
  ensureProfile?: () => Promise<unknown>;
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
          mimeType: avatarType(input.avatarFile || {}),
          filename: avatarUploadName(input.avatarFile || {}),
        },
      );
      // Remember the storage id, not just "uploaded": a failed profile update
      // retries with the same object instead of dropping the photo.
      input.uploaded.set(localAvatar, avatarStorageId);
    }
  }
  const update = () =>
    input.updateProfile({
      name: input.next.name,
      username: input.next.username || input.remote.username || "",
      bio: input.next.bio || "",
      avatarStorageId,
    });
  try {
    await update();
  } catch (error) {
    if (!messageOf(error).includes("PROFILE_NOT_READY") || !input.ensureProfile)
      throw error;
    await input.ensureProfile();
    await update();
  }
}
