import React from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import {
  Album,
  Asset,
  AssetField,
  MediaType,
  Query,
  getPermissionsAsync,
  presentPermissionsPicker,
  requestPermissionsAsync,
} from "expo-media-library";
import type {
  AssetMetadata,
  GranularPermission,
  MediaTypeFilter,
} from "expo-media-library";
import { IconButton, tap } from "../../ui/primitives";
import { coral, onCoral, palette } from "../../ui/theme";
import {
  appendUniqueStoryAssets,
  formatStoryDuration,
  storySelectionOrder,
  toggleStorySelection,
  STORY_PICKER_LIMIT,
} from "./storyPickerModel";
import type {
  PickedStoryMedia,
  StoryPickerFilter,
} from "./storyPickerModel";
import { styles as s } from "./Stories.styles";
import { StoryPickerBody, type StoryPickerAccess } from "./StoryPickerBody";
import { StoryAlbumSheet } from "./StoryAlbumSheet";
import { loadStoryAlbums, type StoryAlbum } from "./storyAlbums";

const PAGE_SIZE = 60;
const GRID_GAP = 4;
const GRID_PADDING = 12;
const GRANULAR_PERMISSIONS: GranularPermission[] = ["photo", "video"];
const MEDIA_FILTERS: MediaTypeFilter[] = ["photo", "video"];
const FILTERS: { id: StoryPickerFilter; label: string }[] = [
  { id: "recents", label: "Recents" },
  { id: "photos", label: "Photos" },
  { id: "videos", label: "Videos" },
];

type Access = StoryPickerAccess;

type Props = {
  dark: boolean;
  onPicked: (media: PickedStoryMedia[]) => void;
  onClose: () => void;
  title?: string;
  permissionTitle?: string;
  permissionText?: string;
  emptyTitle?: string;
  emptyText?: string;
};

function queryPage(
  filter: StoryPickerFilter,
  offset: number,
  album?: Album,
) {
  const query = new Query()
    .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
    .limit(PAGE_SIZE)
    .offset(offset);
  if (album) query.album(album);
  if (filter === "photos") {
    query.eq(AssetField.MEDIA_TYPE, MediaType.IMAGE);
  } else if (filter === "videos") {
    query.eq(AssetField.MEDIA_TYPE, MediaType.VIDEO);
  } else {
    query.within(AssetField.MEDIA_TYPE, [MediaType.IMAGE, MediaType.VIDEO]);
  }
  return query.exeForMetadata();
}

/**
 * An in-app library grid, so picking a story never launches Android's
 * right-to-left system photo sheet. The local metadata query gives the grid
 * cheap thumbnails; only the selected items resolve to uploadable file URIs.
 */
export function StoryPicker(props: Props) {
  const colors = palette(props.dark);
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - GRID_PADDING * 2 - GRID_GAP * 2) / 3);
  const [access, setAccess] = React.useState<Access>("checking");
  const [limited, setLimited] = React.useState(false);
  const [assets, setAssets] = React.useState<AssetMetadata[]>([]);
  const [albums, setAlbums] = React.useState<StoryAlbum[]>([]);
  const [albumId, setAlbumId] = React.useState<string | null>(null);
  const [albumOpen, setAlbumOpen] = React.useState(false);
  const [filter, setFilter] = React.useState<StoryPickerFilter>("recents");
  const [selection, setSelection] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [preparing, setPreparing] = React.useState(false);
  const [cameraBusy, setCameraBusy] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const alive = React.useRef(true);
  const request = React.useRef(0);
  const camera = React.useRef(false);
  const selectedAlbum = albums.find((item) => item.id === albumId)?.album;
  const currentAlbumTitle =
    albums.find((item) => item.id === albumId)?.title || "Recents";
  const limit = STORY_PICKER_LIMIT;

  const checkAccess = React.useCallback(async (prompt: boolean) => {
    try {
      let response = await getPermissionsAsync(false, GRANULAR_PERMISSIONS);
      if (!response.granted && prompt) {
        response = await requestPermissionsAsync(false, GRANULAR_PERMISSIONS);
      }
      if (!alive.current) return;
      if (response.granted) {
        setLimited(response.accessPrivileges === "limited");
        setAccess("ready");
      } else {
        setLimited(false);
        setAccess("denied");
      }
    } catch {
      if (alive.current) setAccess("denied");
    }
  }, []);

  React.useEffect(() => {
    alive.current = true;
    void checkAccess(true);
    return () => {
      alive.current = false;
      request.current += 1;
    };
  }, [checkAccess]);

  React.useEffect(() => {
    if (access !== "ready") return;
    void loadStoryAlbums()
      .then((items) => {
        if (alive.current) setAlbums(items);
      })
      .catch(() => {
        if (alive.current) setAlbums([]);
      });
  }, [access, reloadKey]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void checkAccess(false).then(() => {
        if (alive.current) setReloadKey((value) => value + 1);
      });
    });
    return () => subscription.remove();
  }, [checkAccess]);

  const loadPage = React.useCallback(
    async (reset: boolean, offset: number) => {
      if (access !== "ready") return;
      const token = ++request.current;
      if (reset) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }
      try {
         const page = await queryPage(filter, offset, selectedAlbum);
        if (token !== request.current) return;
        setAssets((current) => {
          if (reset) return page;
          return appendUniqueStoryAssets(current, page);
        });
        setHasMore(page.length === PAGE_SIZE);
      } catch (cause) {
        if (token !== request.current) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "The photo library could not be read.",
        );
      } finally {
        if (token === request.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
     [access, filter, selectedAlbum],
  );

  React.useEffect(() => {
    if (access !== "ready") return;
    setAssets([]);
    setHasMore(true);
    void loadPage(true, 0);
  }, [access, filter, reloadKey, loadPage]);

  async function openCamera() {
    if (camera.current) return;
    camera.current = true;
    setCameraBusy(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Camera permission needed",
          "Allow camera access in device settings to take a photo or video story.",
          [
            { text: "Not now", style: "cancel" },
            {
              text: "Open settings",
              onPress: () => void Linking.openSettings(),
            },
          ],
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images", "videos"],
        allowsEditing: false,
        quality: 0.85,
        videoMaxDuration: 60,
      });
      if (result.canceled) return;
      const media = result.assets
        .filter((asset) => !!asset.uri)
        .map((asset) => ({
          uri: asset.uri,
         video: asset.type === "video",
           filename: asset.fileName ?? undefined,
           width: asset.width,
           height: asset.height,
           duration: asset.duration ? asset.duration / 1000 : undefined,
        }));
      if (media.length) props.onPicked(media);
    } catch (cause) {
      Alert.alert(
        "Couldn't open the camera",
        cause instanceof Error ? cause.message : "Please try again.",
      );
    } finally {
      camera.current = false;
      if (alive.current) setCameraBusy(false);
    }
  }

  async function manageAccess() {
    try {
      await presentPermissionsPicker(MEDIA_FILTERS);
      await checkAccess(false);
      if (alive.current) setReloadKey((value) => value + 1);
    } catch {
      void Linking.openSettings();
    }
  }

  function toggle(id: string) {
    const selected = selection.includes(id);
    if (!selected && selection.length >= limit) {
      Alert.alert(
        "Up to 10 items",
        "Remove one item before adding another to this story.",
      );
      return;
    }
    tap();
    setSelection((current) =>
      toggleStorySelection(current, id, limit),
    );
  }

  async function next() {
    if (!selection.length || preparing) return;
    setPreparing(true);
    try {
      const resolved = await Promise.all(
        selection.map(async (id) => {
          try {
            const info = await new Asset(id).getInfo();
            return {
              uri: info.uri,
              video: info.mediaType === MediaType.VIDEO,
              filename: info.filename,
              width: info.width,
              height: info.height,
              duration: info.duration ? info.duration / 1000 : undefined,
            };
          } catch {
            return null;
          }
        }),
      );
      const media = resolved.filter(
        (item): item is NonNullable<typeof item> => !!item?.uri,
      );
      if (!media.length) {
        throw new Error("Those items are no longer available.");
      }
      props.onPicked(media);
    } catch (cause) {
      Alert.alert(
        "Couldn't open media",
        cause instanceof Error ? cause.message : "Please pick the items again.",
      );
    } finally {
      if (alive.current) setPreparing(false);
    }
  }

  function loadMore() {
    if (loading || loadingMore || !hasMore || error) return;
    void loadPage(false, assets.length);
  }

  return (
    <View style={[s.flex, { backgroundColor: colors.bg }]}>
      <SafeAreaView
        edges={["top", "left", "right"]}
        style={s.flex}
      >
        <View style={s.pickerHeader}>
             <IconButton
            name="close"
            label="Cancel story"
            color={colors.fg}
             onPress={props.onClose}
          />
           <Text
             style={[s.pickerTitle, { color: colors.fg }]}
           >
             {props.title ?? "Add to story"}
          </Text>
          {cameraBusy ? (
            <View style={s.pickerHeaderBusy}>
              <ActivityIndicator color={colors.fg} />
            </View>
          ) : (
            <IconButton
              name="camera-outline"
              label="Take a photo or video"
              color={colors.fg}
              onPress={() => void openCamera()}
            />
          )}
        </View>
        {access === "ready" && limited && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage which photos Messenger can see"
            onPress={() => void manageAccess()}
            style={[s.pickerLimited, { backgroundColor: colors.tint }]}
          >
            <Ionicons
              name="images-outline"
              size={16}
              color={colors.coralInk}
            />
            <Text style={[s.pickerLimitedText, { color: colors.fg }]}>
              Showing selected media
            </Text>
            <Text style={[s.pickerLimitedAction, { color: colors.coralInk }]}>
              Manage
            </Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Choose album. Current album: ${currentAlbumTitle}`}
          onPress={() => setAlbumOpen(true)}
          style={[s.pickerAlbumButton, { borderColor: colors.line }]}
        >
          <Ionicons name="folder-open-outline" size={18} color={colors.coralInk} />
          <Text style={[s.pickerAlbumTitle, { color: colors.fg }]} numberOfLines={1}>
            {currentAlbumTitle}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.muted} />
        </Pressable>
        <View style={s.pickerFilters}>
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  tap();
                  setFilter(item.id);
                }}
                style={[
                  s.pickerChip,
                  { borderColor: active ? coral : colors.line },
                  active && { backgroundColor: coral },
                ]}
              >
                <Text
                  style={[
                    s.pickerChipText,
                    { color: active ? onCoral : colors.muted },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <StoryPickerBody
          access={access}
          colors={colors}
          assets={assets}
          tile={tile}
          selection={selection}
          loading={loading}
          loadingMore={loadingMore}
          error={error}
          onAllowAccess={() => void checkAccess(true)}
          onOpenCamera={() => void openCamera()}
          onRetry={() => void loadPage(true, 0)}
          onToggle={toggle}
          onLoadMore={loadMore}
          copy={{
            permissionTitle: props.permissionTitle ?? "Choose from your photos",
            permissionText:
              props.permissionText ??
              "Allow Messenger to see your photos and videos so you can add them to a story.",
            emptyTitle: props.emptyTitle ?? "No photos or videos yet",
            emptyText:
              props.emptyText ?? "Take a photo or video to start your story.",
          }}
        />
      </SafeAreaView>
      {access === "ready" && selection.length > 0 && (
        <SafeAreaView
          edges={["bottom", "left", "right"]}
          style={[
            s.pickerFooter,
            {
              backgroundColor: colors.bg,
              borderTopColor: colors.line,
            },
          ]}
        >
          <Text style={[s.pickerSelectedText, { color: colors.muted }]}>
            {selection.length} selected
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: preparing }}
            disabled={preparing}
            onPress={() => void next()}
            style={[s.pickerNext, { opacity: preparing ? 0.6 : 1 }]}
          >
            {preparing ? (
              <ActivityIndicator color={onCoral} />
            ) : (
              <Text style={s.pickerNextText}>Next</Text>
            )}
          </Pressable>
        </SafeAreaView>
      )}
      {albumOpen && (
        <StoryAlbumSheet
          colors={colors}
          albums={albums}
          selectedId={albumId}
          onSelect={(id) => {
            setAlbumId(id);
            setAlbumOpen(false);
          }}
          onClose={() => setAlbumOpen(false)}
        />
      )}
    </View>
  );
}
