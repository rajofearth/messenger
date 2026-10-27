import React from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { AssetMetadata } from "expo-media-library";
import { IconButton } from "../../ui/primitives";
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
      <View style={[s.albumSheet, { backgroundColor: props.colors.bg }]}>
        <View style={s.albumHeader}>
          <Text style={[s.albumTitle, { color: props.colors.fg }]}>Select album</Text>
          <IconButton
            name="close"
            label="Close albums"
            color={props.colors.fg}
            onPress={props.onClose}
          />
        </View>
        <ScrollView
          contentContainerStyle={s.albumList}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={props.refreshing}
              onRefresh={props.onRefresh}
              colors={[props.colors.coralInk]}
              tintColor={props.colors.coralInk}
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
        </ScrollView>
      </View>
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
          <Ionicons name="images-outline" size={24} color={colors.coralInk} />
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
      {selected && <Ionicons name="checkmark" size={22} color={colors.coralInk} />}
    </Pressable>
  );
}
