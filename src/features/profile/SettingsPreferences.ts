import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { setHapticsEnabled } from "../../ui/primitives";
import { messengerRepository } from "../../data/messengerRepository";
import type { SettingsRecord } from "../../data/records";
import type { PickedMedia } from "../media/mediaPickerModel";

type Preferences = SettingsRecord;
export type SettingsProfile = Pick<
  Preferences,
  "name" | "avatar" | "sound" | "previews" | "systemNotifications"
> &
  Partial<Pick<Preferences, "bio" | "username" | "haptics">>;
export type ProfileChangeOptions = {
  remote?: boolean;
  /** The picker's real format, so the upload does not claim a PNG is a JPEG. */
  avatar?: { mimeType?: string; filename?: string };
};
export type ProfileChangeHandler = (
  profile: SettingsProfile,
  options?: ProfileChangeOptions,
) => void | Promise<void>;
type Sheet = "profile" | "privacy" | "info" | null;
export const DEFAULT_PREFERENCES: Preferences = {
  name: "Messenger user",
  bio: "",
  username: "",
  haptics: true,
  avatar: "",
  sound: true,
  previews: true,
  systemNotifications: true,
};

/** Turns an upload/profile failure into a next step, not a generic shrug. */
function avatarSaveReason(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("FILE_TOO_LARGE"))
    return "That photo is larger than 25 MiB. Choose a smaller one.";
  if (message.includes("INVALID_MIME"))
    return "That image format is not supported. Choose a JPEG, PNG or WebP photo.";
  if (message.includes("AUTH_REQUIRED"))
    return "Your session expired. Sign in again and choose the photo.";
  if (message.includes("USERNAME_TAKEN"))
    return "Your username is already in use. Update it in Edit profile, then try the photo again.";
  if (message.includes("INVALID_USERNAME") || message.includes("PROFILE_NOT_READY"))
    return "Finish setting up your profile name and username, then try the photo again.";
  if (message.includes("UnableToUpload") || message.includes("Upload failed"))
    return "The photo could not reach the server. Check your connection and try again.";
  return "We could not save your choice. Check your connection and try again.";
}

export function useSettingsPreferences(
  onProfileChange?: ProfileChangeHandler,
) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const current = useRef(DEFAULT_PREFERENCES);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const stored = await messengerRepository.loadSettings();
        if (stored) {
          const loaded: Preferences = {
            name: stored.name?.trim() ? stored.name : DEFAULT_PREFERENCES.name,
            bio:
              typeof stored.bio === "string"
                ? stored.bio
                : DEFAULT_PREFERENCES.bio,
            username:
              typeof stored.username === "string"
                ? stored.username
                : DEFAULT_PREFERENCES.username,
            haptics:
              typeof stored.haptics === "boolean" ? stored.haptics : true,
            avatar:
              typeof stored.avatar === "string" && stored.avatar
                ? stored.avatar
                : DEFAULT_PREFERENCES.avatar,
            sound: typeof stored.sound === "boolean" ? stored.sound : true,
            previews:
              typeof stored.previews === "boolean" ? stored.previews : true,
            systemNotifications: stored.systemNotifications !== false,
          };
          if (active) {
            current.current = loaded;
            setPreferences(loaded);
          }
        }
      } catch {
        if (active)
          Alert.alert(
            "Could not load settings",
            "Your saved settings could not be read. You can still make and save changes.",
          );
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    setHapticsEnabled(preferences.haptics);
  }, [preferences, ready]);

  // Serialize writes so a slower earlier save cannot overwrite a newer preference.
  function persist(patch: Partial<Preferences>): Promise<void> {
    const next = { ...current.current, ...patch };
    current.current = next;
    setPreferences(next);
    const write = writes.current.then(() =>
      messengerRepository.saveSettings(next).then(() => undefined),
    );
    writes.current = write.catch(() => {});
    return write;
  }

  function toggle(
    key: "sound" | "previews" | "haptics" | "systemNotifications",
    value: boolean,
  ) {
    if (key === "haptics") setHapticsEnabled(value);
    void persist({ [key]: value }).catch(() => {
      Alert.alert(
        "Settings not saved",
        "This change is active for now, but could not be saved. Please try again.",
      );
    });
    // Keep the shared profile in step with the switch immediately. These
    // notification and haptic fields live only on this device, so no remote
    // profile write is needed.
    void Promise.resolve(
      onProfileChange?.({ ...current.current }, { remote: false }),
    ).catch(() => {});
  }

  async function pickAvatar() {
    if (!ready || picking) return;
    setPicking(true);
    let opened = false;
    try {
      // The Android/iOS system photo picker grants access to the chosen item;
      // an extra media-library permission prompt is unnecessary and can fail
      // on Android's selected-photos mode.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsMultipleSelection: false,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      opened = true;
      const asset = result.assets[0];
      setAvatarFailed(false);
      await saveAvatarAsset(asset.uri, asset.mimeType, asset.fileName ?? undefined);
    } catch (error) {
      Alert.alert(
        opened ? "Photo could not be saved" : "Could not open photos",
        opened
          ? avatarSaveReason(error)
          : "The photo library could not be opened. Please try again.",
      );
    } finally {
      setPicking(false);
    }
  }

  async function saveAvatarAsset(
    uri: string,
    mimeType?: string,
    filename?: string,
  ) {
    const previousAvatar = current.current.avatar;
    await persist({ avatar: uri });
    try {
      await onProfileChange?.(
        { ...current.current },
        { avatar: { mimeType, filename } },
      );
    } catch (error) {
      await persist({ avatar: previousAvatar }).catch(() => {});
      throw error;
    }
  }

  async function savePickedAvatar(media: PickedMedia[]) {
    const asset = media[0];
    if (!ready || picking || !asset || asset.video) return;
    setPicking(true);
    try {
      setAvatarFailed(false);
      await saveAvatarAsset(asset.uri, asset.mimeType ?? "image/jpeg", asset.filename);
    } catch (error) {
      Alert.alert("Photo could not be saved", avatarSaveReason(error));
    } finally {
      setPicking(false);
    }
  }

  function editProfile() {
    if (!ready) return;
    setName(preferences.name);
    setBio(preferences.bio);
    setUsername(preferences.username);
    setSheet("profile");
  }

  async function saveProfile() {
    if (!ready || saving || picking) return;
    if (!name.trim()) {
      Alert.alert("Add your name", "Enter a name before saving your profile.");
      return;
    }
    const handle = username.trim().replace(/^@/, "");
    if (handle && !/^[a-zA-Z0-9_]{3,30}$/.test(handle)) {
      Alert.alert(
        "Check your username",
        "Use 3 to 30 letters, numbers, or underscores, or leave it empty.",
      );
      return;
    }
    setSaving(true);
    try {
      const next: SettingsProfile = {
        ...current.current,
        name: name.trim(),
        bio: bio.trim(),
        username: handle,
      };
      // Wait for the server before committing the local copy and closing the
      // sheet, so a failed username change cannot look saved.
      await onProfileChange?.(next);
      await persist({ name: next.name, bio: next.bio, username: next.username });
      setSheet(null);
    } catch {
      Alert.alert(
        "Profile not saved",
        "Your profile could not be saved. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return {
    preferences,
    ready,
    sheet,
    setSheet,
    name,
    setName,
    bio,
    setBio,
    username,
    setUsername,
    saving,
    picking,
    avatarFailed,
    setAvatarFailed,
    toggle,
    pickAvatar,
    savePickedAvatar,
    editProfile,
    saveProfile,
  };
}
