import React from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Camera } from "expo-camera";
import type { AssetMetadata } from "expo-media-library";
import { IconButton, tap } from "../../ui/primitives";
import { coral, onCoral, palette } from "../../ui/theme";
import {
  toggleStorySelection,
  MEDIA_PICKER_LIMIT,
} from "./mediaPickerModel";
import type { PickedMedia, MediaPickerFilter } from "./mediaPickerModel";
import { styles as s } from "./MediaPicker.styles";
import { MediaPickerGrid } from "./MediaPickerGrid";
import { MediaAlbumSheet } from "./MediaAlbumSheet";
import { MediaPickerPreview } from "./MediaPickerPreview";
import { MediaCamera } from "./MediaCamera";
import { resolvePickedMediaItems } from "./resolvePickedMedia";
import { useMediaPickerBack } from "./useMediaPickerBack";
import { trackDevEvent } from "../../services/devTelemetry";
import { prepareCameraCapture } from "./prepareCameraCapture";
import { useMediaPickerLibrary } from "./useMediaPickerLibrary";
const GRID_GAP = 4;
const GRID_PADDING = 12;
const FILTERS: { id: MediaPickerFilter; label: string }[] = [
  { id: "recents", label: "Recents" },
  { id: "photos", label: "Photos" },
  { id: "videos", label: "Videos" },
];

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
  appendCameraCapture?: boolean;
};

export function MediaPicker(props: Props) {
  const colors = palette(props.dark);
  const photosOnly = props.mediaMode === "photos";
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - GRID_PADDING * 2 - GRID_GAP * 2) / 3);
  const {
    access,
    limited,
    assets,
    albums,
    recentCount,
    filter,
    albumId,
    currentAlbumTitle,
    loading,
    loadingMore,
    error,
    refreshingAlbums,
    checkAccess,
    manageAccess,
    refresh,
    refreshAlbums,
    refreshAlbumsIfStale,
    selectFilter,
    selectAlbum,
    loadMore,
  } = useMediaPickerLibrary({ photosOnly });
  const [albumOpen, setAlbumOpen] = React.useState(false);
  const [selection, setSelection] = React.useState<string[]>([]);
  const [preparing, setPreparing] = React.useState(false);
  const [cameraBusy, setCameraBusy] = React.useState(false);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<AssetMetadata | null>(null);
  const alive = React.useRef(true);
  const camera = React.useRef(false);
  const limit = props.selectionLimit ?? MEDIA_PICKER_LIMIT;
  const filters = photosOnly ? FILTERS.filter((item) => item.id !== "videos") : FILTERS;
  useMediaPickerBack({
    preview: !!preview,
    albumOpen,
    cameraOpen,
    onClose: props.onClose,
    onPreview: () => setPreview(null),
    onAlbum: () => setAlbumOpen(false),
    onCamera: () => setCameraOpen(false),
  });

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  function openAlbums() {
    refreshAlbumsIfStale();
    setAlbumOpen(true);
  }

  function chooseFilter(id: MediaPickerFilter) {
    if (id === filter) return;
    tap();
    selectFilter(id);
  }

  function chooseAlbum(id: string | null) {
    setAlbumOpen(false);
    if (id === albumId) return;
    selectAlbum(id);
  }

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
      const available = await resolvePickedMediaItems(selection);
      if (!available.length) {
        throw new Error("Those items are no longer available.");
      }
      if (available.length !== selection.length) {
        // A refresh or a permission change can remove an asset that was
        // selected earlier. Drop it from the selection instead of sending a
        // shorter story silently, and tell the user it happened.
        const missing = selection.length - available.length;
        const keep = new Set(available.map((item) => item.id));
        setSelection((current) => current.filter((id) => keep.has(id)));
        Alert.alert(
          "Some items are unavailable",
          `${missing} selected item${missing === 1 ? " is" : "s are"} no longer in your library, so ${missing === 1 ? "it was" : "they were"} removed. Check the selection and try again.`,
        );
        return;
      }
      props.onPicked(available.map((item) => item.media));
    } catch (cause) {
      Alert.alert(
        "Couldn't open media",
        cause instanceof Error ? cause.message : "Please pick the items again.",
      );
    } finally {
      if (alive.current) setPreparing(false);
    }
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
          onPress={openAlbums}
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
                onPress={() => chooseFilter(item.id)}
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
          refreshing={loading && assets.length > 0}
          error={error}
          onAllowAccess={() => void checkAccess(true)}
          onOpenCamera={() => void openCamera()}
          onRetry={refresh}
          onRefresh={refresh}
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
          refreshing={refreshingAlbums}
          onRefresh={refreshAlbums}
          onSelect={chooseAlbum}
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
              void prepareCameraCapture(media, selection, !!props.appendCameraCapture, limit).then((result) => {
                if (!alive.current) return;
                setCameraOpen(false);
                if (result.full) {
                  Alert.alert(
                    "Story is full",
                    `You can add up to ${limit} items. Remove one before capturing another.`,
                  );
                  return;
                }
                props.onPicked(result.media ?? []);
              });
            }}
          />
        </View>
      )}
    </View>
  );
}
