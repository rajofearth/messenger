import React, { useEffect, useState } from "react";
import { AppState, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { styles } from "./CallScreen.styles";

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
    <View style={{ padding: 8, paddingBottom: 28 }}>
      <Text style={[styles.youText, { textAlign: "center", marginBottom: 8 }]}>
        {failed ? "Camera unavailable" : permissionError ? "Permission unavailable" : "Local preview"}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={busy || !active}
        onPress={() => {
          if (failed) setFailed(false);
          else void enableCamera();
        }}
      >
        <Text style={[styles.youText, { textAlign: "center", color: "#F28B70" }]}>
          {busy ? "Please wait" : label}
        </Text>
      </Pressable>
    </View>
  );
}
