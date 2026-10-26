import React, { useRef, useState } from "react";
import { Animated, FlatList, PanResponder, Pressable, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { StoryDraft } from "./storyComposerModel";
import { dragTargetIndex, moveDraftTo, removeDraft } from "./storyComposerModel";
import { StoryMedia } from "./StoryMedia";
import { StoryCropSheet } from "./StoryCropSheet";
import { getMediaThumbnail } from "../../services/mediaThumbnails";
import { tap } from "../../ui/primitives";
import { styles as s } from "./Stories.styles";
import { styles as c } from "./StoryComposer.styles";
type Props = {
  drafts: StoryDraft[];
  index: number;
  onIndex: (index: number) => void;
  onDrafts: (drafts: StoryDraft[]) => void;
  onAddMedia: () => void;
  onPublish: () => void;
  onClose: () => void;
  canAddMedia: boolean;
};
const THUMB_SLOT_WIDTH = 60;
const reviewPosterCache = new Map<string, string>();
export function StoryDraftReview(props: Props) {
  const pager = useRef<FlatList<StoryDraft>>(null);
  const { width } = useWindowDimensions();
  const [cropOpen, setCropOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragTarget, setDragTarget] = useState<number | null>(null);
  const dragOrigin = useRef<number | null>(null);
  const currentIndex = useRef(props.index);
  const onIndexRef = useRef(props.onIndex);
  currentIndex.current = props.index;
  onIndexRef.current = props.onIndex;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 65 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ index: number | null; isViewable?: boolean }> }) => {
    const visible = viewableItems.find((item) => item.isViewable && item.index !== null);
    if (visible?.index !== null && visible?.index !== undefined && visible.index !== currentIndex.current) {
      onIndexRef.current(visible.index);
    }
  }).current;
  const current = props.drafts[props.index];
  if (!current) return null;
  function select(index: number) {
    props.onIndex(index);
    pager.current?.scrollToIndex({ index, animated: true });
  }
  function updateCurrent(patch: Partial<StoryDraft>) {
    props.onDrafts(props.drafts.map((item, index) => index === props.index ? { ...item, ...patch } : item));
  }
  function removeCurrent() {
    const next = removeDraft(props.drafts, props.index);
    props.onDrafts(next);
    props.onIndex(Math.max(0, Math.min(props.index, next.length - 1)));
  }
  function startDrag(index: number) {
    dragOrigin.current = index;
    setDragIndex(index);
    setDragTarget(index);
  }
  function drag(index: number, dx: number) {
    const origin = dragOrigin.current ?? index;
    const target = dragTargetIndex(origin, dx, THUMB_SLOT_WIDTH, props.drafts.length);
    if (target === dragTarget) return;
    tap();
    setDragTarget(target);
  }
  function reorder(from: number, to: number) {
    const activeId = props.drafts[props.index]?.id;
    const next = moveDraftTo(props.drafts, from, to);
    props.onDrafts(next);
    const nextIndex = next.findIndex((item) => item.id === activeId);
    if (nextIndex >= 0) {
      props.onIndex(nextIndex);
      pager.current?.scrollToIndex({ index: nextIndex, animated: false });
    }
  }
  function moveBy(index: number, direction: -1 | 1) {
    const target = Math.max(0, Math.min(props.drafts.length - 1, index + direction));
    reorder(index, target);
  }
  function endDrag() {
    const from = dragOrigin.current;
    const to = dragTarget;
    if (from !== null && to !== null && from !== to) reorder(from, to);
    dragOrigin.current = null;
    setDragIndex(null);
    setDragTarget(null);
  }
  return (
    <SafeAreaView style={s.viewer}>
      <View style={s.flex}>
        <FlatList
          ref={pager}
          style={s.flex}
          data={props.drafts}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={props.index}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
          removeClippedSubviews={false}
          extraData={props.index}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          keyExtractor={(item) => `page-${item.id}`}
          renderItem={({ item, index }) => <ReviewPage draft={item} active={index === props.index} width={width} />}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          onMomentumScrollEnd={(event) => {
            const next = Math.round(event.nativeEvent.contentOffset.x / Math.max(1, event.nativeEvent.layoutMeasurement.width));
            props.onIndex(Math.max(0, Math.min(next, props.drafts.length - 1)));
          }}
        />
        <View style={c.composerScrim} pointerEvents="none" />
        <View style={c.composerTop} pointerEvents="box-none">
          <Pressable accessibilityRole="button" accessibilityLabel="Back to choose media" onPress={props.onClose} style={c.composerRoundButton}>
            <Ionicons name="arrow-back" size={23} color="white" />
          </Pressable>
          <Text style={c.composerTitle}>Review story</Text>
          <Text style={c.composerCount}>{props.index + 1} / {props.drafts.length}</Text>
        </View>
        <View style={c.composerTools} pointerEvents="box-none">
          <Pressable accessibilityRole="button" accessibilityLabel={current.video ? "Toggle video framing" : "Open photo crop editor"} onPress={() => current.video ? updateCurrent({ crop: current.crop === "fill" ? "fit" : "fill" }) : setCropOpen(true)} style={c.composerTool}>
            <Ionicons name="crop-outline" size={21} color="white" />
            <Text style={c.composerToolText}>{current.video ? (current.crop === "fill" ? "Fit" : "Fill") : "Crop"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Delete this media" onPress={removeCurrent} style={c.composerTool}>
            <Ionicons name="trash-outline" size={21} color="white" />
            <Text style={c.composerToolText}>Delete</Text>
          </Pressable>
        </View>
        <View style={c.composerBottom} pointerEvents="box-none">
          <TextInput
            accessibilityLabel={`Story caption ${props.index + 1}`}
            placeholder="Add a caption"
            placeholderTextColor="#FFFFFFAA"
            value={current.caption}
            onChangeText={(caption) => updateCurrent({ caption })}
            style={c.captionInput}
            maxLength={180}
            multiline
          />
          {dragTarget !== null && <Text style={c.composerHint}>Release to place at {dragTarget + 1} of {props.drafts.length}</Text>}
          <View style={c.composerActionsRow}>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: !props.canAddMedia }} accessibilityLabel={props.canAddMedia ? "Add more media" : "Story limit reached"} disabled={!props.canAddMedia} onPress={props.onAddMedia} style={[c.composerAddButton, !props.canAddMedia && c.composerDisabled]}>
              <Ionicons name="add" size={22} color="white" />
              <Text style={c.composerAddText}>Add media</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Publish ${props.drafts.length} ${props.drafts.length === 1 ? "story" : "stories"}`} onPress={props.onPublish} style={c.share}>
              <Text style={c.shareText}>Share {props.drafts.length > 1 ? `${props.drafts.length} stories` : "story"}</Text>
            </Pressable>
          </View>
          <FlatList
            horizontal
            data={props.drafts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={c.composerThumbs}
            showsHorizontalScrollIndicator={false}
            extraData={`${props.index}-${dragIndex}-${dragTarget}`}
            renderItem={({ item, index }) => (
              <StoryThumbnail
                item={item}
                index={index}
                active={index === props.index}
                dragging={index === dragIndex}
                dropTarget={dragTarget === index && dragIndex !== index}
                onPress={() => select(index)}
                onDragStart={() => startDrag(index)}
                onDragMove={(dx) => drag(index, dx)}
                onDragEnd={endDrag}
                onMoveBy={(direction) => moveBy(index, direction)}
              />
            )}
          />
        </View>
        {cropOpen && !current.video && (
          <StoryCropSheet
            draft={current}
            onApply={updateCurrent}
            onClose={() => setCropOpen(false)}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
function ReviewPage({ draft, active, width }: { draft: StoryDraft; active: boolean; width: number }) {
  const [poster, setPoster] = React.useState<string | null>(() => reviewPosterCache.get(draft.uri) ?? null);
  React.useEffect(() => {
    if (!draft.video) return;
    let alive = true;
    const cached = reviewPosterCache.get(draft.uri);
    if (cached) {
      setPoster(cached);
      return () => {
        alive = false;
      };
    }
    void getMediaThumbnail(draft.uri, 384).then((next) => {
      if (alive && next && next !== draft.uri) {
        reviewPosterCache.set(draft.uri, next);
        setPoster(next);
      }
    });
    return () => {
      alive = false;
    };
  }, [draft.uri, draft.video]);
  return (
    <View style={[s.previewPage, { width }]}>
      {active ? <StoryMedia key={`${draft.id}-${draft.uri}`} uri={draft.uri} video={draft.video} crop={draft.crop} preview controls poster={poster ?? undefined} /> : draft.video ? poster ? <Image source={{ uri: poster }} style={s.image} contentFit="contain" /> : <View style={s.previewVideoPlaceholder}><Ionicons name="videocam-outline" size={42} color="#FFFFFF88" /><Text style={s.previewVideoPlaceholderText}>Loading video preview…</Text></View> : <Image source={{ uri: draft.uri }} style={s.image} contentFit="contain" />}
    </View>
  );
}
function StoryThumbnail({ item, index, active, dragging, dropTarget, onPress, onDragStart, onDragMove, onDragEnd, onMoveBy }: {
  item: StoryDraft;
  index: number;
  active: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onPress: () => void;
  onDragStart: () => void;
  onDragMove: (dx: number) => void;
  onDragEnd: () => void;
  onMoveBy: (direction: -1 | 1) => void;
}) {
  const [poster, setPoster] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!item.video) return;
    let alive = true;
    void getMediaThumbnail(item.uri, 192).then((next) => {
      if (alive && next && next !== item.uri) setPoster(next);
    });
    return () => {
      alive = false;
    };
  }, [item.uri, item.video]);
  const draggingRef = useRef(dragging);
  const moveRef = useRef(onDragMove);
  const endRef = useRef(onDragEnd);
  const dragX = useRef(new Animated.Value(0)).current;
  draggingRef.current = dragging;
  moveRef.current = onDragMove;
  endRef.current = onDragEnd;
  React.useEffect(() => {
    if (!dragging) {
      Animated.spring(dragX, { toValue: 0, useNativeDriver: true, stiffness: 260, damping: 22, mass: 0.7 }).start();
    }
  }, [dragX, dragging]);
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: () => draggingRef.current,
    onMoveShouldSetPanResponder: () => draggingRef.current,
    onPanResponderMove: (_, gesture) => {
      dragX.setValue(gesture.dx);
      moveRef.current(gesture.dx);
    },
    onPanResponderRelease: () => endRef.current(),
    onPanResponderTerminate: () => endRef.current(),
  })).current;
  return (
    <Animated.View {...responder.panHandlers} style={[dragging && c.composerThumbDragging, dragging && { zIndex: 20, transform: [{ translateX: dragX }, { translateY: -8 }, { scale: 1.08 }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Review media ${index + 1}. Long press to reorder.`}
        accessibilityActions={[{ name: "increment", label: "Move media later" }, { name: "decrement", label: "Move media earlier" }]}
        onAccessibilityAction={(event) => onMoveBy(event.nativeEvent.actionName === "decrement" ? -1 : 1)}
        onPress={onPress}
        onLongPress={onDragStart}
        delayLongPress={220}
        style={[c.composerThumb, active && c.composerThumbActive, !dragging && dropTarget && c.composerThumbDropTarget, dragging && c.composerThumbDropPlaceholder]}
      >
        {item.video && !poster ? <View style={c.composerThumbPlaceholder}><Ionicons name="videocam-outline" size={19} color="#FFFFFF88" /></View> : <Image source={{ uri: poster ?? item.uri }} style={c.composerThumbImage} contentFit="cover" />}
        {item.video && <Ionicons name="play" size={15} color="white" style={c.composerVideoIcon} />}
        <Text style={c.composerThumbNumber}>{index + 1}</Text>
      </Pressable>
      {dropTarget && <Text style={c.composerThumbDropLabel}>Drop</Text>}
    </Animated.View>
  );
}
