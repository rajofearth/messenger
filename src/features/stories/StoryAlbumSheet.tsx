import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import type { AssetMetadata } from "expo-media-library";
import { IconButton } from "../../ui/primitives";
import type { Colors } from "../../ui/theme";
import type { StoryAlbum } from "./storyAlbums";
import { styles as s } from "./Stories.styles";

type Props = {
  colors: Colors;
  albums: Array<Omit<StoryAlbum, "album">>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
};

export function StoryAlbumSheet(props: Props) {
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
        >
          <AlbumRow
            colors={props.colors}
            title="Recents"
            selected={props.selectedId === null}
            onPress={() => props.onSelect(null)}
          />
          {props.albums.map((item) => (
            <AlbumRow
              key={item.id}
              colors={props.colors}
              title={item.title}
              cover={item.cover}
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
  selected,
  onPress,
}: {
  colors: Colors;
  title: string;
  cover?: AssetMetadata | null;
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
        <Image source={{ uri: cover.id }} contentFit="cover" style={s.albumCover} />
      ) : (
        <View style={[s.albumIcon, { backgroundColor: colors.line }]}>
          <Ionicons name="images-outline" size={24} color={colors.coralInk} />
        </View>
      )}
      <Text style={[s.albumRowTitle, { color: colors.fg }]} numberOfLines={1}>
        {title}
      </Text>
      {selected && <Ionicons name="checkmark" size={22} color={colors.coralInk} />}
    </Pressable>
  );
}
