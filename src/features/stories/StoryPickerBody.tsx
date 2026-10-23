import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { MediaType } from "expo-media-library";
import type { AssetMetadata } from "expo-media-library";
import type { Colors } from "../../ui/theme";
import { coral } from "../../ui/theme";
import {
  formatStoryDuration,
  storySelectionOrder,
} from "./storyPickerModel";
import { styles as s } from "./Stories.styles";

export type StoryPickerAccess = "checking" | "ready" | "denied";

type Props = {
  access: StoryPickerAccess;
  colors: Colors;
  assets: AssetMetadata[];
  tile: number;
  selection: string[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  onAllowAccess: () => void;
  onOpenCamera: () => void;
  onRetry: () => void;
  onToggle: (id: string) => void;
  onLoadMore: () => void;
  copy: {
    permissionTitle: string;
    permissionText: string;
    emptyTitle: string;
    emptyText: string;
  };
};

export function StoryPickerBody(props: Props) {
  if (props.access === "checking" || props.loading) {
    return (
      <View style={s.pickerCenter}>
        <ActivityIndicator size="large" color={coral} />
        <Text style={[s.pickerEmptyText, { color: props.colors.muted }]}>
          Loading your photos…
        </Text>
      </View>
    );
  }
  if (props.access === "denied") {
    return (
      <View style={s.pickerCenter}>
        <View
          style={[s.pickerPermissionIcon, { backgroundColor: props.colors.tint }]}
        >
          <Ionicons
            name="images-outline"
            size={34}
            color={props.colors.coralInk}
          />
        </View>
        <Text style={[s.pickerEmptyTitle, { color: props.colors.fg }]}>
          {props.copy.permissionTitle}
        </Text>
        <Text style={[s.pickerEmptyText, { color: props.colors.muted }]}>
          {props.copy.permissionText}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={props.onAllowAccess}
          style={s.pickerPrimary}
        >
          <Text style={s.pickerPrimaryText}>Allow access</Text>
        </Pressable>
      </View>
    );
  }
  if (props.error) {
    return (
      <View style={s.pickerCenter}>
        <Text style={[s.pickerEmptyTitle, { color: props.colors.fg }]}>
          Couldn't load media
        </Text>
        <Text style={[s.pickerEmptyText, { color: props.colors.muted }]}>
          {props.error}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={props.onRetry}
          style={s.pickerPrimary}
        >
          <Text style={s.pickerPrimaryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
  if (!props.assets.length) {
    return (
      <View style={s.pickerCenter}>
        <Text style={[s.pickerEmptyTitle, { color: props.colors.fg }]}>
          {props.copy.emptyTitle}
        </Text>
        <Text style={[s.pickerEmptyText, { color: props.colors.muted }]}>
          {props.copy.emptyText}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={props.onOpenCamera}
          style={s.pickerPrimary}
        >
          <Text style={s.pickerPrimaryText}>Open camera</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <FlatList
      data={props.assets}
      keyExtractor={(item) => item.id}
      numColumns={3}
      style={s.flex}
      contentContainerStyle={s.pickerGrid}
      columnWrapperStyle={s.pickerRow}
      ItemSeparatorComponent={GridGap}
      renderItem={({ item }) => {
        const order = storySelectionOrder(props.selection, item.id);
        const selected = order > 0;
        const duration = formatStoryDuration(item.duration);
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              item.mediaType === MediaType.VIDEO
                ? `Video${duration ? `, ${duration}` : ""}`
                : "Photo"
            }
            accessibilityState={{ selected }}
            onPress={() => props.onToggle(item.id)}
            style={[
              s.pickerTile,
              {
                width: props.tile,
                height: props.tile,
                backgroundColor: props.colors.line,
              },
            ]}
          >
            <Image
              source={{ uri: item.id }}
              recyclingKey={item.id}
              contentFit="cover"
              transition={120}
              style={s.flex}
            />
            <View
              style={[s.pickerBadge, selected && s.pickerBadgeSelected]}
            >
              {selected && <Text style={s.pickerBadgeText}>{order}</Text>}
            </View>
            {item.mediaType === MediaType.VIDEO && (
              <View style={s.pickerVideoBadge}>
                <Ionicons name="play" size={10} color="white" />
                {!!duration && (
                  <Text style={s.pickerVideoText}>{duration}</Text>
                )}
              </View>
            )}
          </Pressable>
        );
      }}
      onEndReached={props.onLoadMore}
      onEndReachedThreshold={0.6}
      initialNumToRender={18}
      maxToRenderPerBatch={12}
      windowSize={7}
      removeClippedSubviews
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open camera"
          onPress={props.onOpenCamera}
          style={[
            s.pickerCameraCard,
            {
              width: props.tile,
              height: props.tile,
              backgroundColor: props.colors.line,
            },
          ]}
        >
          <Ionicons name="camera" size={32} color={props.colors.fg} />
          <Text style={[s.pickerCameraText, { color: props.colors.fg }]}>Camera</Text>
        </Pressable>
      }
      ListFooterComponent={
        props.loadingMore ? (
          <ActivityIndicator color={coral} style={s.pickerFooterSpinner} />
        ) : null
      }
    />
  );
}

function GridGap() {
  return <View style={s.pickerGridGap} />;
}
