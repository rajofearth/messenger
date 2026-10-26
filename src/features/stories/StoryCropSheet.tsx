import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import type { ImageResult } from "expo-image-manipulator";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { StoryDraft } from "./storyComposerModel";
import { styles as c } from "./StoryComposer.styles";

type Ratio = "story" | "square" | "original";

export function StoryCropSheet({
  draft,
  onApply,
  onClose,
}: {
  draft: StoryDraft;
  onApply: (patch: Partial<StoryDraft>) => void;
  onClose: () => void;
}) {
  const [ratio, setRatio] = useState<Ratio>("story");
  const [result, setResult] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const { height: viewportHeight } = useWindowDimensions();
  const width = draft.width ?? 0;
  const height = draft.height ?? 0;

  useEffect(() => {
    let alive = true;
    if (!width || !height) return undefined;
    const crop = centeredCrop(width, height, ratio);
    setBusy(true);
    void manipulateAsync(draft.uri, [{ crop }], { compress: 0.9, format: SaveFormat.JPEG })
      .then((next: ImageResult) => {
        if (alive) setResult(next);
      })
      .catch(() => {
        if (alive) setResult(null);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [draft.uri, height, ratio, width]);

  const preview = result?.uri ?? draft.uri;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={c.cropOverlay}>
        <ScrollView style={c.cropCard} contentContainerStyle={c.cropCardContent} showsVerticalScrollIndicator={false}>
          <View style={c.cropHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close crop editor" onPress={onClose} style={c.composerRoundButton}>
              <Ionicons name="close" size={23} color="white" />
            </Pressable>
            <Text style={c.cropTitle}>Crop photo</Text>
            <View style={c.composerRoundButton} />
          </View>
            <View style={[c.cropPreview, { height: Math.min(390, Math.max(240, viewportHeight * 0.38)) }]}>
            <Image source={{ uri: preview }} style={c.cropImage} contentFit="contain" />
            {busy && <ActivityIndicator color="white" style={c.cropSpinner} />}
          </View>
          <Text style={c.cropHint}>Choose a frame, then apply the crop to this story item.</Text>
          <View style={c.cropRatios}>
            {(["story", "square", "original"] as Ratio[]).map((item) => (
              <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: ratio === item }} onPress={() => setRatio(item)} style={[c.cropRatio, ratio === item && c.cropRatioActive]}>
                <Text style={[c.cropRatioText, ratio === item && c.cropRatioTextActive]}>{labelFor(item)}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Apply crop" disabled={busy || !result} onPress={() => {
            if (!result) return;
            onApply({ uri: result.uri, width: result.width, height: result.height, crop: "fit" });
            onClose();
          }} style={[c.cropApply, (busy || !result) && c.composerDisabled]}>
            <Text style={c.cropApplyText}>Apply crop</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function labelFor(ratio: Ratio) {
  if (ratio === "story") return "Story 9:16";
  if (ratio === "square") return "Square 1:1";
  return "Original";
}

function centeredCrop(width: number, height: number, ratio: Ratio) {
  if (ratio === "original") return { originX: 0, originY: 0, width, height };
  const target = ratio === "square" ? 1 : 9 / 16;
  const current = width / height;
  if (current > target) {
    const cropWidth = Math.max(1, Math.round(height * target));
    return { originX: Math.floor((width - cropWidth) / 2), originY: 0, width: cropWidth, height };
  }
  const cropHeight = Math.max(1, Math.round(width / target));
  return { originX: 0, originY: Math.floor((height - cropHeight) / 2), width, height: cropHeight };
}
