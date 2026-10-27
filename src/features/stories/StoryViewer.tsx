import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { StoryGroup } from "../../domain/stories";
import type { Story } from "../../domain/data";
import { chatTimeLabel } from "../../domain/time";
import { isStoryReady } from "../../domain/stories";
import { useStoryViewers } from "../../state/useStoryViewers";
import { Avatar, IconButton } from "../../ui/primitives";
import { StoryMedia } from "./StoryMedia";
import { StorySaveAction } from "./StorySaveAction";
import { styles as s } from "./Stories.styles";
import { trackDevEvent } from "../../services/devTelemetry";

type Props = {
  groups: StoryGroup[];
  initialIndex: number;
  selfId?: string | null;
  onSeen: (id: string) => void;
  onDelete: (id: string) => void;
  onRetryUpload: (id: string) => void;
  onSave: (story: Story) => Promise<boolean>;
  onClose: () => void;
};

export function StoryViewer(props: Props) {
  const { groups } = props;
  const [selection, setSelection] = useState(() => ({
    owner: groups[props.initialIndex]?.id,
    item: groups[props.initialIndex]?.items[0]?.id,
    ownerIndex: props.initialIndex,
    itemIndex: 0,
  }));
  const foundOwner = groups.findIndex((group) => group.id === selection.owner);
  const ownerIndex =
    foundOwner >= 0
      ? Math.max(0, Math.min(foundOwner, groups.length - 1))
      : Math.max(0, Math.min(selection.ownerIndex, groups.length - 1));
  const group = groups[ownerIndex];
  const foundItem =
    group?.items.findIndex((item) => item.id === selection.item) ?? -1;
  const itemIndex =
    foundItem >= 0
      ? foundItem
      : Math.max(
          0,
          Math.min(selection.itemIndex, (group?.items.length ?? 1) - 1),
        );
  const active = group?.items[itemIndex];
  const ownStory =
    !!active &&
    (active.ownerId === "self" ||
      group?.id === "self" ||
      (!!props.selfId && active.ownerId === props.selfId));
  const localOnly =
    active?.uploadStatus === "uploading" || active?.uploadStatus === "failed";
  const ready = !!active && isStoryReady(active);
  const viewers = useStoryViewers(
    ownStory && active && !localOnly ? active.id : null,
  );
  const [viewersOpen, setViewersOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [held, setHeld] = useState(false);
  const [background, setBackground] = useState(
    AppState.currentState !== "active",
  );
  const paused = held || background || viewersOpen || saving;
  const [progress, setProgress] = useState({ id: active?.id, value: 0 });
  const elapsed = useRef(0);
  const latest = useRef({ props, ownerIndex, itemIndex, active, paused });
  latest.current = { props, ownerIndex, itemIndex, active, paused };

  function select(owner: number, item: number) {
    const target = latest.current.props.groups[owner];
    if (!target) {
      if (owner >= latest.current.props.groups.length)
        latest.current.props.onClose();
      return;
    }
    setSelection({
      owner: target.id,
      item: target.items[item]?.id,
      ownerIndex: owner,
      itemIndex: item,
    });
    setViewersOpen(false);
    setSaving(false);
  }
  function move(direction: number, ownerOnly = false) {
    const current = latest.current;
    const owner = current.props.groups[current.ownerIndex];
    if (!owner) return;
    const nextItem = current.itemIndex + direction;
    if (!ownerOnly && nextItem >= 0 && nextItem < owner.items.length) {
      select(current.ownerIndex, nextItem);
    } else {
      const nextOwner = current.ownerIndex + direction;
      const target = current.props.groups[nextOwner];
      select(
        nextOwner,
        !ownerOnly && direction < 0 ? (target?.items.length ?? 1) - 1 : 0,
      );
    }
  }
  const moveRef = useRef(move);
  moveRef.current = move;
  const width = useRef(1);
  const started = useRef(0);
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        started.current = Date.now();
        setHeld(true);
      },
      onPanResponderRelease: (event, gesture) => {
        setHeld(false);
        if (
          Math.abs(gesture.dx) >= 60 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy)
        ) {
          moveRef.current(gesture.dx < 0 ? 1 : -1, true);
        } else if (
          Date.now() - started.current < 250 &&
          Math.abs(gesture.dx) < 15 &&
          Math.abs(gesture.dy) < 15
        ) {
          moveRef.current(
            event.nativeEvent.locationX < width.current / 3 ? -1 : 1,
          );
        }
      },
      onPanResponderTerminate: () => setHeld(false),
      onPanResponderTerminationRequest: () => true,
    }),
  ).current;

  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) =>
      setBackground(state !== "active"),
    );
    return () => listener.remove();
  }, []);
  useEffect(() => {
    elapsed.current = 0;
    setProgress({ id: active?.id, value: 0 });
    setViewersOpen(false);
    setSaving(false);
    if (active && !ownStory) latest.current.props.onSeen(active.id);
    else if (!active) latest.current.props.onClose();
  }, [active?.id, ownStory]);
  useEffect(() => {
    if (!active || active.video || paused || !isStoryReady(active)) return;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      elapsed.current += now - last;
      last = now;
      setProgress({
        id: active.id,
        value: Math.min(1, elapsed.current / 5000),
      });
      if (elapsed.current >= 5000) {
        clearInterval(timer);
        moveRef.current(1);
      }
    }, 50);
    return () => clearInterval(timer);
  }, [active?.id, active?.video, paused]);

  if (!active || !group) return <View style={s.viewer} />;
  const posted = active.createdAt ? chatTimeLabel(active.createdAt) : null;
  const uploadPercent =
    active.uploadStatus === "uploading"
      ? Math.max(0, Math.min(100, Math.round((active.uploadProgress ?? 0) * 100)))
      : null;
  const viewCount = viewers?.length ?? 0;
  return (
    <SafeAreaView style={s.viewer}>
      <View style={s.flex}>
        <StoryMedia
          key={active.id}
          uri={active.image}
          variants={active.variants}
          sourceWidth={active.width}
          previewUri={active.previewUri}
          previewWidth={active.previewWidth}
          video={active.video}
          crop={active.crop}
          paused={paused || !ready}
          onProgress={(value) => setProgress({ id: active.id, value })}
          onEnd={() => {
            if (ready) moveRef.current(1);
          }}
        />
        <LinearGradient
          colors={["#00000099", "transparent", "#000000AA"]}
          style={s.image}
          pointerEvents="none"
        />
        <View style={s.top}>
          <View style={s.tracks}>
            {group.items.map((item, i) => (
              <View key={item.id} style={s.track}>
                {item.uploadStatus === "failed" && (
                  <View style={s.uploadFailed} />
                )}
                <View
                  style={[
                    s.fill,
                    {
                      width: `${i < itemIndex ? 100 : i === itemIndex && progress.id === active.id ? progress.value * 100 : 0}%`,
                    },
                  ]}
                />
                {item.uploadStatus === "uploading" && (
                  <View
                    style={[
                      s.uploadFill,
                      {
                        width: `${Math.max(0, Math.min(100, Math.round((item.uploadProgress ?? 0) * 100)))}%`,
                      },
                    ]}
                  />
                )}
              </View>
            ))}
          </View>
          <View style={s.header}>
            <Avatar uri={group.avatar} name={group.name} size={38} />
            <View style={s.owner}>
              <Text style={[s.name, s.ownerName]} numberOfLines={1}>
                {group.name}
              </Text>
              {ownStory && ready && (
                <View style={s.statsRow}>
                  {posted && <Text style={s.statsText}>Posted {posted}</Text>}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${viewCount} ${viewCount === 1 ? "viewer" : "viewers"}. Open viewer list.`}
                    hitSlop={8}
                     onPress={() => {
                       setViewersOpen(true);
                       trackDevEvent("story_viewers_open", { count: viewCount });
                     }}
                    style={s.statsButton}
                  >
                    <Ionicons name="eye-outline" size={13} color="#FFFFFFCC" />
                    <Text style={s.statsText}>
                      {viewCount} {viewCount === 1 ? "view" : "views"}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
            {ownStory && (
              <IconButton
                name="trash-outline"
                label="Delete your story"
                color="white"
                onPress={() => props.onDelete(active.id)}
              />
            )}
            <IconButton
              name="close"
              label="Close story"
              color="white"
              onPress={props.onClose}
            />
          </View>
        </View>
        <View
          style={s.flex}
          {...responder.panHandlers}
          onLayout={(event) => {
            width.current = event.nativeEvent.layout.width;
          }}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`${group.name}, story ${itemIndex + 1} of ${group.items.length}. Hold to pause, swipe to switch person.`}
          accessibilityActions={[
            { name: "increment", label: "Next story" },
            { name: "decrement", label: "Previous story" },
          ]}
          onAccessibilityAction={(event) =>
            move(event.nativeEvent.actionName === "decrement" ? -1 : 1)
          }
        />
        <View style={s.bottom} pointerEvents="box-none">
          {!!active.caption && (
            <Text style={s.caption} pointerEvents="none">
              {active.caption}
            </Text>
          )}
          {ownStory && ready && (
              <View style={s.storyActions}>
                <Pressable accessibilityRole="button" accessibilityLabel="Open story activity" onPress={() => {
                  setViewersOpen(true);
                  trackDevEvent("story_viewers_open", { count: viewCount });
                }} style={s.storyAction}>
                  <Ionicons name="eye-outline" size={25} color="white" />
                  <Text style={s.storyActionLabel}>{viewCount} {viewCount === 1 ? "view" : "views"}</Text>
                </Pressable>
                <StorySaveAction key={active.id} onBusyChange={setSaving} onSave={() => {
                  trackDevEvent("story_save_requested", { video: !!active.video });
                  return props.onSave(active);
                }} />
              </View>
            )}
          {active.uploadStatus === "uploading" && (
            <View style={s.uploadState}>
              <ActivityIndicator size="small" color="white" />
              <Text style={s.uploadText}>
                Uploading {uploadPercent ?? 0}% · this story will appear when it finishes
              </Text>
            </View>
          )}
          {active.uploadStatus === "failed" && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry story upload"
              onPress={() => props.onRetryUpload(active.id)}
              style={s.retry}
            >
              <Ionicons name="refresh" size={16} color="white" />
              <Text style={s.uploadText}>
                Upload failed · Tap to retry
              </Text>
            </Pressable>
          )}
        </View>
         {viewersOpen && ownStory && ready && (
          <View style={s.viewersLayer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close viewers"
              onPress={() => setViewersOpen(false)}
              style={s.viewersScrim}
            />
            <View style={s.viewersSheet} accessibilityViewIsModal>
              <View style={s.viewersHeader}>
                <Text style={s.viewersTitle}>Viewers</Text>
                <Text style={s.viewersCount}>{viewCount}</Text>
                <IconButton
                  name="close"
                  label="Close viewers"
                  color="white"
                  onPress={() => setViewersOpen(false)}
                />
              </View>
              <ScrollView
                style={s.viewersList}
                contentContainerStyle={s.viewersListContent}
                showsVerticalScrollIndicator={false}
              >
                {viewers === undefined ? (
                  <ActivityIndicator color="white" style={s.viewersLoading} />
                ) : viewers.length === 0 ? (
                  <View style={s.viewersEmptyState}>
                    <Ionicons name="eye-outline" size={34} color="#FFFFFF88" />
                    <Text style={s.viewersEmptyTitle}>0 views yet</Text>
                    <Text style={s.viewersEmpty}>Viewers will appear here after they watch this story.</Text>
                  </View>
                ) : (
                  viewers.map((view) => (
                    <View key={view.id} style={s.viewerRow}>
                      <Avatar
                        uri={view.avatar ?? ""}
                        name={view.name}
                        size={36}
                      />
                      <View style={s.viewerCopy}>
                        <Text style={s.viewerName} numberOfLines={1}>
                          {view.name}
                        </Text>
                        <Text style={s.viewerTime}>
                          {chatTimeLabel(view.seenAt) ?? "Viewed"}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
