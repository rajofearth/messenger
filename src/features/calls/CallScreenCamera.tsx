import React, { useEffect, useState } from "react";
import { AppState, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { CALL_ACCENT, styles } from "./CallScreen.styles";

export default function CallScreenCamera({ front }: { front: boolean }) {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [active, setActive] = useState(AppState.currentState === "active");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permissionError, setPermissionError] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setActive(state === "active");
      if (state === "active") {
        void getPermission().catch(() => setPermissionError(true));
      }
    });
    return () => subscription.remove();
  }, [getPermission]);

  async function enableCamera() {
    setBusy(true);
    setPermissionError(false);
    try {
      if (permission && !permission.granted && !permission.canAskAgain) {
        await Linking.openSettings();
      } else {
        await requestPermission();
      }
    } catch {
      setPermissionError(true);
    } finally {
      setBusy(false);
    }
  }

  if (permission?.granted && !permissionError && !failed && active) {
    return (
      <CameraView
        key={front ? "front" : "back"}
        style={StyleSheet.absoluteFill}
        facing={front ? "front" : "back"}
        mirror={front}
        mode="picture"
        mute
        onMountError={() => setFailed(true)}
        accessibilityLabel={`Your live ${front ? "front" : "rear"} camera preview`}
      />
    );
  }

  const label = failed
    ? "Retry camera"
    : permission?.granted && !permissionError
      ? "Camera paused"
      : permission && !permission.canAskAgain && !permission.granted
        ? "Open settings"
        : "Enable camera";
  return (
    <View style={{ padding: 12, paddingBottom: 28, alignItems: "center", maxWidth: 260 }}>
      <Text style={[styles.youText, { textAlign: "center", marginBottom: 6 }]}
      >
        {failed ? "Camera unavailable" : permissionError ? "Camera permission unavailable" : "Camera preview"}
      </Text>
      <Text style={{ color: "#D9DBDF", fontSize: 12, lineHeight: 17, textAlign: "center", marginBottom: 10 }}>
        {failed
          ? "The preview could not start. Try opening it again."
          : permissionError
            ? "Camera access could not be checked. Try again, or use Settings if access was blocked."
            : permission?.granted
              ? "The preview pauses while Messenger is in the background."
              : "Allow camera access to show your video to you during this call."}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={busy || !active}
        onPress={() => {
          if (failed) setFailed(false);
          else void enableCamera();
        }}
        style={({ pressed }) => [
          styles.cameraAction,
          pressed && styles.pressed,
          (busy || !active) && styles.disabledAction,
        ]}
      >
        <Text style={[styles.youText, { textAlign: "center", color: CALL_ACCENT }]}>
          {busy ? "Please wait" : label}
        </Text>
      </Pressable>
    </View>
  );
}
