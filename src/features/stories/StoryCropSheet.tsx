import React, { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, PanResponder, Pressable, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { SaveFormat, useImageManipulator } from "expo-image-manipulator";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { StoryDraft } from "./storyComposerModel";
import { styles as c } from "./StoryComposer.styles";

type Ratio = "story" | "square" | "original";
type Point = { x: number; y: number };
type Size = { width: number; height: number };

export function StoryCropSheet({
  draft,
  onApply,
  onClose,
}: {
  draft: StoryDraft;
  onApply: (patch: Partial<StoryDraft>) => void;
  onClose: () => void;
}) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [ratio, setRatio] = useState<Ratio>("story");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [cropError, setCropError] = useState(false);
  const sourceWidth = draft.width ?? 0;
  const sourceHeight = draft.height ?? 0;
  const manipulator = useImageManipulator(draft.uri);
  const frame = useMemo(
    () => frameSize(ratio, sourceWidth, sourceHeight, viewportWidth, viewportHeight),
    [ratio, sourceHeight, sourceWidth, viewportHeight, viewportWidth],
  );
  const scale = sourceWidth && sourceHeight
    ? Math.max(frame.width / sourceWidth, frame.height / sourceHeight) * zoom
    : 1;
  const displayed = { width: sourceWidth * scale, height: sourceHeight * scale };
  const boundedOffset = clampOffset(offset, displayed, frame);
  const panStart = useRef({ offset: boundedOffset, zoom, pinchDistance: 0 });
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      const touches = event.nativeEvent.touches;
      panStart.current = {
        offset: boundedOffset,
        zoom,
        pinchDistance: touches.length >= 2 ? distance(touches[0], touches[1]) : 0,
      };
    },
    onPanResponderMove: (event, gesture) => {
      const touches = event.nativeEvent.touches;
      if (touches.length >= 2 && panStart.current.pinchDistance > 0) {
        const nextZoom = clamp(
          panStart.current.zoom * (distance(touches[0], touches[1]) / panStart.current.pinchDistance),
          1,
          4,
        );
        const nextScale = Math.max(frame.width / Math.max(1, sourceWidth), frame.height / Math.max(1, sourceHeight)) * nextZoom;
        setZoom(nextZoom);
        setOffset(clampOffset(panStart.current.offset, { width: sourceWidth * nextScale, height: sourceHeight * nextScale }, frame));
        return;
      }
      setOffset(clampOffset({ x: panStart.current.offset.x + gesture.dx, y: panStart.current.offset.y + gesture.dy }, displayed, frame));
    },
  })).current;

  async function apply() {
    if (busy || !sourceWidth || !sourceHeight) return;
    if (ratio === "original" && zoom === 1 && offset.x === 0 && offset.y === 0) {
      onApply({ crop: "fit" });
      onClose();
      return;
    }
    setBusy(true);
    setCropError(false);
    try {
      const crop = sourceCrop({ sourceWidth, sourceHeight, frame, displayed, offset: boundedOffset });
      manipulator.reset().crop(crop);
      const rendered = await manipulator.renderAsync();
      const result = await rendered.saveAsync({ compress: 0.92, format: SaveFormat.JPEG });
      onApply({ uri: result.uri, width: result.width, height: result.height, crop: "fit" });
      onClose();
    } catch {
      setCropError(true);
    } finally {
      setBusy(false);
    }
  }

  function chooseRatio(next: Ratio) {
    setRatio(next);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={c.cropOverlay}>
        <View style={c.cropCard}>
          <View style={c.cropCardContent}>
            <View style={c.cropHeader}>
              <Pressable accessibilityRole="button" accessibilityLabel="Close crop editor" onPress={onClose} style={c.composerRoundButton}>
                <Ionicons name="close" size={23} color="white" />
              </Pressable>
              <Text style={c.cropTitle}>Crop photo</Text>
              <View style={c.composerRoundButton} />
            </View>
            <Text style={c.cropHint}>Pinch to zoom. Drag to choose what stays in the frame.</Text>
            <View {...responder.panHandlers} style={[c.cropPreview, { width: frame.width, height: frame.height, alignSelf: "center" }]}>
              {sourceWidth > 0 && sourceHeight > 0 && (
                <Image
                  source={{ uri: draft.uri }}
                  style={{ position: "absolute", left: (frame.width - displayed.width) / 2 + boundedOffset.x, top: (frame.height - displayed.height) / 2 + boundedOffset.y, width: displayed.width, height: displayed.height }}
                  contentFit="fill"
                />
              )}
              <View pointerEvents="none" style={c.cropFrame} />
              {busy && <ActivityIndicator color="white" style={c.cropSpinner} />}
            </View>
            {cropError && <Text style={c.cropError}>Couldn’t apply that crop. Try again.</Text>}
            <View style={c.cropZoomRow}>
              <Text style={c.cropZoomLabel}>Zoom {zoom.toFixed(1)}×</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => setZoom((value) => clamp(value - 0.25, 1, 4))} style={c.cropZoomButton}><Text style={c.cropZoomButtonText}>−</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => setZoom((value) => clamp(value + 0.25, 1, 4))} style={c.cropZoomButton}><Text style={c.cropZoomButtonText}>+</Text></Pressable>
            </View>
            <View style={c.cropRatios}>
              {(["story", "square", "original"] as Ratio[]).map((item) => (
                <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: ratio === item }} onPress={() => chooseRatio(item)} style={[c.cropRatio, ratio === item && c.cropRatioActive]}>
                  <Text style={[c.cropRatioText, ratio === item && c.cropRatioTextActive]}>{labelFor(item)}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Apply crop" disabled={busy || !sourceWidth || !sourceHeight} onPress={() => void apply()} style={[c.cropApply, (busy || !sourceWidth || !sourceHeight) && c.composerDisabled]}>
              {busy ? <ActivityIndicator color="white" /> : <Text style={c.cropApplyText}>Apply crop</Text>}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function frameSize(ratio: Ratio, width: number, height: number, viewportWidth: number, viewportHeight: number) {
  const target = ratio === "story" ? 9 / 16 : ratio === "square" ? 1 : width && height ? width / height : 1;
  const maxWidth = Math.min(Math.max(1, viewportWidth - 36), 380);
  const maxHeight = Math.min(Math.max(1, viewportHeight * 0.46), 420);
  const frameWidth = Math.min(maxWidth, maxHeight * target);
  return { width: frameWidth, height: frameWidth / target };
}

function sourceCrop({ sourceWidth, sourceHeight, frame, displayed, offset }: { sourceWidth: number; sourceHeight: number; frame: Size; displayed: Size; offset: Point }) {
  const left = (frame.width - displayed.width) / 2 + offset.x;
  const top = (frame.height - displayed.height) / 2 + offset.y;
  const scale = displayed.width / sourceWidth;
  const width = Math.min(sourceWidth, Math.max(1, Math.round(frame.width / scale)));
  const height = Math.min(sourceHeight, Math.max(1, Math.round(frame.height / scale)));
  return {
    originX: Math.max(0, Math.min(sourceWidth - width, Math.round(-left / scale))),
    originY: Math.max(0, Math.min(sourceHeight - height, Math.round(-top / scale))),
    width,
    height,
  };
}

function clampOffset(offset: Point, displayed: Size, frame: Size) {
  const maxX = Math.max(0, (displayed.width - frame.width) / 2);
  const maxY = Math.max(0, (displayed.height - frame.height) / 2);
  return { x: clamp(offset.x, -maxX, maxX), y: clamp(offset.y, -maxY, maxY) };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distance(first: { pageX: number; pageY: number }, second: { pageX: number; pageY: number }) {
  return Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY);
}

function labelFor(ratio: Ratio) {
  if (ratio === "story") return "Story 9:16";
  if (ratio === "square") return "Square 1:1";
  return "Original";
}
