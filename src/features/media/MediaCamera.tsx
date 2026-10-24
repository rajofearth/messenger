import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { CameraView } from "expo-camera";
import type { CameraCapturedPicture } from "expo-camera";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { PickedMedia } from "./mediaPickerModel";
import { styles as s } from "./MediaPicker.styles";
import { trackDevEvent } from "../../services/devTelemetry";

type Props = {
  photosOnly: boolean;
  onCaptured: (media: PickedMedia) => void;
  onClose: () => void;
};

export function MediaCamera(props: Props) {
  const camera = React.useRef<CameraView>(null);
  const [ready, setReady] = React.useState(false);
  const [facing, setFacing] = React.useState<"front" | "back">("back");
  const [flash, setFlash] = React.useState<"off" | "on">("off");
  const [mode, setMode] = React.useState<"picture" | "video">("picture");
  const [recording, setRecording] = React.useState(false);
  const [recordingSeconds, setRecordingSeconds] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!recording) {
      setRecordingSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => clearInterval(timer);
  }, [recording]);

  async function capture() {
    if (!camera.current || !ready || busy) return;
    const startedAt = Date.now();
    setError(null);
    try {
      if (mode === "picture") {
        setBusy(true);
        const picture: CameraCapturedPicture = await camera.current.takePictureAsync({
          quality: 0.86,
          skipProcessing: false,
        });
        if (picture.uri) {
          trackDevEvent("camera_photo_captured", {
            durationMs: Date.now() - startedAt,
          });
          props.onCaptured({
            uri: picture.uri,
            video: false,
            mimeType: "image/jpeg",
            width: picture.width,
            height: picture.height,
          });
        }
        setBusy(false);
      } else if (!recording) {
        setRecording(true);
        const result = await camera.current.recordAsync({
          maxDuration: 60,
          maxFileSize: 25 * 1024 * 1024,
        });
        if (result?.uri) {
          trackDevEvent("camera_video_recorded", {
            durationMs: recordingSeconds * 1000,
          });
          props.onCaptured({
            uri: result.uri,
            video: true,
            mimeType: "video/mp4",
          });
        }
        setRecording(false);
      } else {
        camera.current.stopRecording();
      }
    } catch (cause) {
      setRecording(false);
      setBusy(false);
      setError(cause instanceof Error ? cause.message : "The camera could not capture media.");
    } finally {
      setBusy(false);
    }
  }

  function toggleMode() {
    if (props.photosOnly || recording) return;
    setMode((current) => (current === "picture" ? "video" : "picture"));
  }

  return (
    <View style={s.cameraRoot}>
      <StatusBar style="light" hidden />
        <CameraView
        ref={camera}
        style={s.cameraView}
        facing={facing}
        flash={flash}
        mode={mode}
        mute={false}
        enableTorch={flash === "on" && facing === "back"}
        videoQuality="720p"
        animateShutter
        onCameraReady={() => {
          setReady(true);
          trackDevEvent("camera_ready");
        }}
        onMountError={(event) => setError(event.message)}
      />
      <SafeAreaView edges={["top", "bottom", "left", "right"]} style={s.cameraChrome}>
        <View style={s.cameraTopBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close camera" onPress={props.onClose} style={s.cameraIconButton}>
            <Ionicons name="close" size={30} color="white" />
          </Pressable>
          <Text style={s.cameraModeTitle}>{mode === "video" ? "Video" : "Photo"}</Text>
          <View style={s.cameraTopActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Toggle flash" onPress={() => {
              setFlash((current) => current === "off" ? "on" : "off");
              trackDevEvent("camera_torch_toggle", { video: mode === "video" });
            }} style={s.cameraIconButton}>
              <Ionicons name={flash === "on" ? "flash" : "flash-off"} size={22} color="white" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Switch camera" onPress={() => setFacing((current) => current === "back" ? "front" : "back")} style={s.cameraIconButton}>
              <Ionicons name="camera-reverse-outline" size={25} color="white" />
            </Pressable>
          </View>
        </View>
        <View style={s.cameraBottomBar}>
          {error ? <Text style={s.cameraError}>{error}</Text> : recording ? (
            <View style={s.cameraRecordingStatus}>
              <View style={s.cameraRecordingDot} />
              <Text style={s.cameraRecordingText}>{String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:{String(recordingSeconds % 60).padStart(2, "0")}</Text>
            </View>
          ) : <Text style={s.cameraHint}>Tap to capture</Text>}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={recording ? "Stop recording" : mode === "video" ? "Start video recording" : "Take photo"}
            disabled={!ready || busy}
            onPress={() => void capture()}
            style={[s.cameraShutter, mode === "video" && s.cameraShutterVideo, recording && s.cameraShutterRecording]}
          >
            {busy && !recording ? <ActivityIndicator color="white" /> : <View style={[s.cameraShutterInner, recording && s.cameraShutterRecordingInner]} />}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Switch photo or video mode" onPress={toggleMode} style={s.cameraModeSwitch}>
            <Text style={s.cameraModeSwitchText}>{props.photosOnly ? "Photo" : mode === "picture" ? "Video" : "Photo"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
