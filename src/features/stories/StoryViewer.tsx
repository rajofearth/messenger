import React, { useEffect, useRef, useState } from "react";
import { AppState, PanResponder, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import type { StoryGroup } from "../../domain/stories";
import { Avatar, IconButton } from "../../ui/primitives";
import { StoryMedia } from "./StoryMedia";
import { styles as s } from "./Stories.styles";

type Props = {
  groups: StoryGroup[];
  initialIndex: number;
  onSeen: (id: string) => void;
  onDelete: (id: string) => void;
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
      ? foundOwner
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
  const [held, setHeld] = useState(false);
  const [background, setBackground] = useState(
    AppState.currentState !== "active",
  );
  const paused = held || background;
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
    if (active) latest.current.props.onSeen(active.id);
    else latest.current.props.onClose();
  }, [active?.id]);
  useEffect(() => {
    if (!active || active.video || paused) return;
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
  return (
    <SafeAreaView style={s.viewer}>
      <View style={s.flex}>
        <StoryMedia
          key={active.id}
          uri={active.image}
          video={active.video}
          paused={paused}
          onProgress={(value) => setProgress({ id: active.id, value })}
          onEnd={() => moveRef.current(1)}
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
                <View
                  style={[
                    s.fill,
                    {
                      width: `${i < itemIndex ? 100 : i === itemIndex && progress.id === active.id ? progress.value * 100 : 0}%`,
                    },
                  ]}
                />
              </View>
            ))}
          </View>
          <View style={s.header}>
            <Avatar uri={group.avatar} name={group.name} size={38} />
            <Text style={s.name}>{group.name}</Text>
            {(active.name === "You" || active.ownerId === "self") && (
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
        <View style={s.bottom} pointerEvents="none">
          {!!active.caption && <Text style={s.caption}>{active.caption}</Text>}
        </View>
      </View>
    </SafeAreaView>
  );
}
