import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";

type Preferences = {
  name: string;
  bio: string;
  avatar: string;
  sound: boolean;
  previews: boolean;
};
export type SettingsProfile = Omit<Preferences, "bio">;
type Sheet = "profile" | "privacy" | "info" | null;
const STORAGE_KEY = "@messenger/settings/v1";
const DEFAULTS: Preferences = {
  name: "Alex Morgan",
  bio: "Here for the little moments.",
  avatar:
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=85",
  sound: true,
  previews: true,
};

export function useSettingsPreferences(
  onProfileChange?: (profile: SettingsProfile) => void,
) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  const current = useRef(DEFAULTS);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const value: unknown = JSON.parse(raw);
          if (value && typeof value === "object") {
            const stored = value as Record<string, unknown>;
            const loaded: Preferences = {
              name:
                typeof stored.name === "string" && stored.name.trim()
                  ? stored.name
                  : DEFAULTS.name,
              bio: typeof stored.bio === "string" ? stored.bio : DEFAULTS.bio,
              avatar:
                typeof stored.avatar === "string" && stored.avatar
                  ? stored.avatar
                  : DEFAULTS.avatar,
              sound: typeof stored.sound === "boolean" ? stored.sound : true,
              previews:
                typeof stored.previews === "boolean" ? stored.previews : true,
            };
            if (active) {
              current.current = loaded;
              setPreferences(loaded);
            }
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
    const { name, avatar, sound, previews } = preferences;
    onProfileChange?.({ name, avatar, sound, previews });
  }, [preferences, ready, onProfileChange]);

  // Serialize writes so a slower earlier save cannot overwrite a newer preference.
  function persist(patch: Partial<Preferences>): Promise<void> {
    const next = { ...current.current, ...patch };
    current.current = next;
    setPreferences(next);
    const write = writes.current.then(() =>
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)),
    );
    writes.current = write.catch(() => {});
    return write;
  }

  function toggle(key: "sound" | "previews", value: boolean) {
    void persist({ [key]: value }).catch(() => {
      Alert.alert(
        "Settings not saved",
        "This change is active for now, but could not be saved. Please try again.",
      );
    });
  }

  async function pickAvatar() {
    if (!ready || picking) return;
    setPicking(true);
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Photo access needed",
          "Allow photo library access in your device settings to choose a profile photo.",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setAvatarFailed(false);
        await persist({ avatar: result.assets[0].uri });
      }
    } catch {
      Alert.alert(
        "Photo could not be saved",
        "We could not open the photo library or save your choice. Please try again.",
      );
    } finally {
      setPicking(false);
    }
  }

  function editProfile() {
    setName(preferences.name);
    setBio(preferences.bio);
    setSheet("profile");
  }

  async function saveProfile() {
    if (!name.trim()) {
      Alert.alert("Add your name", "Enter a name before saving your profile.");
      return;
    }
    setSaving(true);
    try {
      await persist({ name: name.trim(), bio: bio.trim() });
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
    saving,
    picking,
    avatarFailed,
    setAvatarFailed,
    toggle,
    pickAvatar,
    editProfile,
    saveProfile,
  };
}
