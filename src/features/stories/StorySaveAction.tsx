import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { styles as s } from "./Stories.styles";

export function StorySaveAction({ onSave, onBusyChange }: {
  onSave: () => Promise<boolean>;
  onBusyChange: (busy: boolean) => void;
}) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function save() {
    if (busy.current || status === "saved") return;
    busy.current = true;
    setStatus("saving");
    onBusyChange(true);
    try {
      const saved = await onSave();
      if (mounted.current) setStatus(saved ? "saved" : "failed");
    } catch {
      if (mounted.current) setStatus("failed");
    } finally {
      busy.current = false;
      if (mounted.current) onBusyChange(false);
    }
  }

  return (
    <View style={s.storyAction}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status === "saved" ? "Story saved to Gallery" : status === "failed" ? "Retry saving story" : "Save story to device"}
        disabled={status === "saving" || status === "saved"}
        onPress={() => void save()}
        style={s.storyAction}
      >
        {status === "saving" ? <ActivityIndicator size="small" color="white" /> : (
          <Ionicons name={status === "saved" ? "checkmark-circle-outline" : "download-outline"} size={25} color="white" />
        )}
        <Text style={s.storyActionLabel}>{status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Save"}</Text>
      </Pressable>
      {status === "saved" || status === "failed" ? (
        <Text accessibilityLiveRegion="polite" style={s.saveFeedback}>
          {status === "saved" ? "Gallery · Messenger album" : "Couldn't save. Tap to retry."}
        </Text>
      ) : null}
    </View>
  );
}
