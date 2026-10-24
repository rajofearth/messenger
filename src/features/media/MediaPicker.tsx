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
import { Camera } from "expo-camera";
import {
  Album,
  Asset,
  MediaType,
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
  appendUniqueMediaAssets,
  toggleStorySelection,
  MEDIA_PICKER_LIMIT,
} from "./mediaPickerModel";
import type { PickedMedia, MediaPickerFilter } from "./mediaPickerModel";
import { styles as s } from "./MediaPicker.styles";
import { MediaPickerGrid, type MediaPickerAccess } from "./MediaPickerGrid";
import { MediaAlbumSheet } from "./MediaAlbumSheet";
import {
  loadMediaAlbums,
  loadRecentMediaCount,
  type MediaAlbum,
} from "./mediaAlbums";
import { MediaPickerPreview } from "./MediaPickerPreview";
import { MediaCamera } from "./MediaCamera";
import { MEDIA_PAGE_SIZE, queryMediaPage } from "./mediaPickerQuery";
import { mediaMimeType } from "./mediaMimeType";
import { trackDevEvent } from "../../services/devTelemetry";
const GRID_GAP = 4;
const GRID_PADDING = 12;
const GRANULAR_PERMISSIONS: GranularPermission[] = ["photo", "video"];
const MEDIA_FILTERS: MediaTypeFilter[] = ["photo", "video"];
const FILTERS: { id: MediaPickerFilter; label: string }[] = [
  { id: "recents", label: "Recents" },
  { id: "photos", label: "Photos" },
  { id: "videos", label: "Videos" },
];
type Access = MediaPickerAccess;
type Props = {
  dark: boolean;
  onPicked: (media: PickedMedia[]) => void;
  onClose: () => void;
  title?: string;
  permissionTitle?: string;
  permissionText?: string;
  emptyTitle?: string;
  emptyText?: string;
  mediaMode?: "photos" | "photos-and-videos";
  selectionLimit?: number;
};
export function MediaPicker(props: Props) {
  const colors = palette(props.dark);
  const photosOnly = props.mediaMode === "photos";
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - GRID_PADDING * 2 - GRID_GAP * 2) / 3);
  const [access, setAccess] = React.useState<Access>("checking");
  const [limited, setLimited] = React.useState(false);
  const [assets, setAssets] = React.useState<AssetMetadata[]>([]);
  const [albums, setAlbums] = React.useState<MediaAlbum[]>([]);
  const [recentCount, setRecentCount] = React.useState<number>();
  const [albumId, setAlbumId] = React.useState<string | null>(null);
  const [albumOpen, setAlbumOpen] = React.useState(false);
  const [filter, setFilter] = React.useState<MediaPickerFilter>("recents");
  const [selection, setSelection] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [preparing, setPreparing] = React.useState(false);
  const [cameraBusy, setCameraBusy] = React.useState(false);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<AssetMetadata | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const alive = React.useRef(true);
  const request = React.useRef(0);
  const camera = React.useRef(false);
  const selectedAlbum = albums.find((item) => item.id === albumId)?.album;
  const currentAlbumTitle =
    albums.find((item) => item.id === albumId)?.title || "Recents";
  const limit = props.selectionLimit ?? MEDIA_PICKER_LIMIT;
  const filters = photosOnly ? FILTERS.filter((item) => item.id !== "videos") : FILTERS;
  const granularPermissions: GranularPermission[] = photosOnly
    ? ["photo"]
    : GRANULAR_PERMISSIONS;
  const checkAccess = React.useCallback(async (prompt: boolean) => {
    try {
      let response = await getPermissionsAsync(false, granularPermissions);
      if (!response.granted && prompt) {
        response = await requestPermissionsAsync(false, granularPermissions);
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
    void Promise.all([loadMediaAlbums(), loadRecentMediaCount()])
      .then(([items, count]) => {
        if (!alive.current) return;
        setAlbums(items);
        setRecentCount(count);
      })
      .catch(() => {
        if (!alive.current) return;
        setAlbums([]);
        setRecentCount(undefined);
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
         const page = await queryMediaPage(filter, offset, selectedAlbum, photosOnly);
        if (token !== request.current) return;
         setAssets((current) => {
           if (reset) return page;
           return appendUniqueMediaAssets(current, page);
         });
         setHasMore(page.length === MEDIA_PAGE_SIZE);
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
    [access, filter, photosOnly, selectedAlbum],
  );

  React.useEffect(() => {
    if (access !== "ready") return;
    setHasMore(true);
    void loadPage(true, 0);
  }, [access, filter, reloadKey, loadPage]);

  async function openCamera() {
    if (camera.current) return;
    camera.current = true;
    const startedAt = Date.now();
    setCameraBusy(true);
    try {
      const permission = await Camera.requestCameraPermissionsAsync();
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
      if (!photosOnly) {
        const microphone = await Camera.requestMicrophonePermissionsAsync();
        if (!microphone.granted) {
          Alert.alert("Microphone permission needed", "Allow microphone access to record videos.");
          return;
        }
      }
      if (alive.current) {
        setCameraOpen(true);
        trackDevEvent("camera_open", { durationMs: Date.now() - startedAt });
      }
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
      await presentPermissionsPicker(photosOnly ? ["photo"] : MEDIA_FILTERS);
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
        `Up to ${limit} item${limit === 1 ? "" : "s"}`,
        `Remove one item before adding another${limit === 1 ? "" : " to this selection"}.`,
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
              mimeType: mediaMimeType(info.filename, info.mediaType === MediaType.VIDEO),
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
          {filters.map((item) => {
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
        <MediaPickerGrid
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
          onPreview={setPreview}
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
        <MediaAlbumSheet
          colors={colors}
          albums={albums}
          recentCount={recentCount}
          selectedId={albumId}
          onSelect={(id) => {
            setAlbumId(id);
            setAlbumOpen(false);
          }}
          onClose={() => setAlbumOpen(false)}
        />
      )}
      {preview && (
        <View style={s.albumOverlay}>
          <MediaPickerPreview
            assets={assets}
            initialIndex={Math.max(0, assets.findIndex((asset) => asset.id === preview.id))}
            colors={colors}
            selection={selection}
            onClose={() => setPreview(null)}
            onToggle={toggle}
          />
        </View>
      )}
      {cameraOpen && (
        <View style={s.cameraOverlay}>
          <MediaCamera
            photosOnly={photosOnly}
            onClose={() => setCameraOpen(false)}
            onCaptured={(media) => {
              setCameraOpen(false);
              props.onPicked([media]);
            }}
          />
        </View>
      )}
    </View>
  );
}
