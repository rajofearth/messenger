import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { MediaType } from "expo-media-library";
import type { AssetMetadata } from "expo-media-library";
import type { Colors } from "../../ui/theme";
import { coral } from "../../ui/theme";
import {
  formatMediaDuration,
  mediaSelectionOrder,
} from "./mediaPickerModel";
import { styles as s } from "./MediaPicker.styles";
import { MediaPickerThumbnail, mediaPickerThumbnailStyles } from "./MediaPickerThumbnail";

export type MediaPickerAccess = "checking" | "ready" | "denied";

type Props = {
  access: MediaPickerAccess;
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
  onPreview: (asset: AssetMetadata) => void;
  onLoadMore: () => void;
  copy: {
    permissionTitle: string;
    permissionText: string;
    emptyTitle: string;
    emptyText: string;
  };
};

export function MediaPickerGrid(props: Props) {
  if (props.access === "checking" || (props.loading && !props.assets.length)) {
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
  const items = [
    { kind: "camera" as const, id: "__camera__" },
    ...props.assets.map((asset) => ({ kind: "asset" as const, asset })),
  ];
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.kind === "camera" ? item.id : item.asset.id}
      numColumns={3}
      style={s.flex}
      contentContainerStyle={s.pickerGrid}
      columnWrapperStyle={s.pickerRow}
      ItemSeparatorComponent={GridGap}
      renderItem={({ item }) => {
        if (item.kind === "camera") {
          return (
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
          );
        }
        const asset = item.asset;
        const order = mediaSelectionOrder(props.selection, asset.id);
        const selected = order > 0;
        const duration = formatMediaDuration(asset.duration);
        return (
          <View
            style={[
              s.pickerTile,
              {
                width: props.tile,
                height: props.tile,
                backgroundColor: props.colors.line,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                asset.mediaType === MediaType.VIDEO
                  ? `Preview video${duration ? `, ${duration}` : ""}`
                  : "Preview photo"
              }
              onPress={() => props.onPreview(asset)}
              style={s.flex}
            >
              <MediaPickerThumbnail
                asset={asset}
                displaySize={props.tile}
                placeholderColor={props.colors.line}
                style={mediaPickerThumbnailStyles.fill}
              />
            </Pressable>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={selected ? "Deselect media" : "Select media"}
              accessibilityState={{ checked: selected }}
              onPress={() => props.onToggle(asset.id)}
              hitSlop={8}
              style={[s.pickerBadge, selected && s.pickerBadgeSelected]}
            >
              {selected && <Text style={s.pickerBadgeText}>{order}</Text>}
            </Pressable>
            {asset.mediaType === MediaType.VIDEO && (
              <View style={s.pickerVideoBadge}>
                <Ionicons name="play" size={10} color="white" />
                {!!duration && (
                  <Text style={s.pickerVideoText}>{duration}</Text>
                )}
              </View>
            )}
          </View>
        );
      }}
      onEndReached={props.onLoadMore}
      onEndReachedThreshold={0.6}
      initialNumToRender={18}
      maxToRenderPerBatch={12}
      windowSize={7}
      removeClippedSubviews
      showsVerticalScrollIndicator={false}
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
