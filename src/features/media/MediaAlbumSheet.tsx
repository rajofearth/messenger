import React from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetMetadata } from "expo-media-library";
import type { Colors } from "../../ui/theme";
import { filterNonEmptyAlbums } from "./mediaPickerModel";
import type { MediaAlbum } from "./mediaAlbums";
import { styles as s } from "./MediaPicker.styles";
import { MediaPickerThumbnail } from "./MediaPickerThumbnail";

type Props = {
  colors: Colors;
  albums: Array<Omit<MediaAlbum, "album">>;
  recentCount?: number;
  selectedId: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onSelect: (id: string | null) => void;
  onClose: () => void;
};

export function MediaAlbumSheet(props: Props) {
  return (
    <View style={s.albumOverlay}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close albums"
        onPress={props.onClose}
        style={s.albumScrim}
      />
      <SafeAreaView
        edges={["bottom", "left", "right"]}
        style={[s.albumSheet, { backgroundColor: props.colors.bg }]}
      >
        <View style={s.albumHeader}>
          <Text style={[s.albumTitle, { color: props.colors.fg }]}>Select album</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close albums"
            onPress={props.onClose}
            style={s.albumCloseAction}
          >
            <Ionicons name="close" size={21} color={props.colors.fg} />
            <Text style={[s.albumCloseText, { color: props.colors.fg }]}>Close</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={s.albumList}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={props.refreshing}
              onRefresh={props.onRefresh}
              colors={[props.colors.fg]}
              tintColor={props.colors.fg}
            />
          }
        >
          <AlbumRow
            colors={props.colors}
            title="Recents"
            count={props.recentCount}
            selected={props.selectedId === null}
            onPress={() => props.onSelect(null)}
          />
          {filterNonEmptyAlbums(props.albums).map((item) => (
            <AlbumRow
              key={item.id}
              colors={props.colors}
              title={item.title}
              cover={item.cover}
              count={item.count}
              selected={item.id === props.selectedId}
              onPress={() => props.onSelect(item.id)}
            />
          ))}
          {!filterNonEmptyAlbums(props.albums).length && (
            <View style={s.albumEmpty}>
              <Text style={[s.albumEmptyTitle, { color: props.colors.fg }]}>No other albums</Text>
              <Text style={[s.albumEmptyText, { color: props.colors.muted }]}>Albums with media will appear here.</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function AlbumRow({
  colors,
  title,
  cover,
  count,
  selected,
  onPress,
}: {
  colors: Colors;
  title: string;
  cover?: AssetMetadata | null;
  count?: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.albumRow, selected && { backgroundColor: colors.tint }]}
    >
      {cover ? (
        <MediaPickerThumbnail
          asset={cover}
          displaySize={52}
          placeholderColor={colors.line}
          priority="normal"
          style={s.albumCover}
        />
      ) : (
        <View style={[s.albumIcon, { backgroundColor: colors.line }]}>
          <Ionicons name="images-outline" size={24} color={colors.fg} />
        </View>
      )}
      <Text style={[s.albumRowTitle, { color: colors.fg }]} numberOfLines={1}>
        {title}
      </Text>
      {count !== undefined && (
        <Text style={[s.albumRowCount, { color: colors.muted }]}>
          {count}
        </Text>
      )}
      {selected && <Ionicons name="checkmark" size={22} color={colors.fg} />}
    </Pressable>
  );
}
