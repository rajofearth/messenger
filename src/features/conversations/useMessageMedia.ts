import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import type { Message } from "../../domain/data";

export function useMessageMedia(onSend: (message: Partial<Message>) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 200);
  const [recording, setRecording] = useState(false);
  const active = useRef(false);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (active.current) {
        active.current = false;
        void recorder
          .stop()
          .catch(() => {})
          .finally(() => {
            void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
          });
      }
    };
  }, [recorder]);

  async function pickPhoto(camera = false) {
    if (busy.current || active.current) return;
    busy.current = true;
    try {
      const permission = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          `Allow ${camera ? "camera" : "photo library"} access in your device settings to share a photo.`,
        );
        return;
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        quality: 0.85,
        allowsEditing: false,
      };
      const result = camera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (mounted.current && !result.canceled && result.assets[0]) {
        onSend({ kind: "image", uri: result.assets[0].uri });
      }
    } catch {
      Alert.alert(
        "Couldn't open photos",
        "Please try choosing the photo again.",
      );
    } finally {
      busy.current = false;
    }
  }

  async function pickFile() {
    if (busy.current || active.current) return;
    busy.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      });
      if (mounted.current && !result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        onSend({ kind: "file", uri: asset.uri, filename: asset.name });
      }
    } catch {
      Alert.alert(
        "Couldn't attach file",
        "Please try choosing the file again.",
      );
    } finally {
      busy.current = false;
    }
  }

  async function resetAudioMode() {
    try {
      await setAudioModeAsync({ allowsRecording: false });
    } catch {
      Alert.alert(
        "Audio unavailable",
        "Couldn't restore playback mode. Please try again.",
      );
    }
  }

  async function record() {
    if (busy.current) return;
    busy.current = true;
    try {
      if (active.current) {
        const seconds = Math.max(1, Math.round(recorder.currentTime));
        await recorder.stop();
        active.current = false;
        await resetAudioMode();
        if (mounted.current) {
          setRecording(false);
          if (!recorder.uri) throw new Error("Missing recording URI");
          onSend({ kind: "audio", uri: recorder.uri, duration: seconds });
        }
      } else {
        const permission = await requestRecordingPermissionsAsync();
        if (!mounted.current) return;
        if (!permission.granted) {
          Alert.alert(
            "Microphone permission needed",
            "Allow microphone access to record a voice note.",
          );
          return;
        }
        active.current = true;
        setRecording(true);
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
        await recorder.prepareToRecordAsync();
        if (!mounted.current) {
          await recorder.stop();
          active.current = false;
          await resetAudioMode();
          return;
        }
        recorder.record();
      }
    } catch {
      // A failed stop must not leave the microphone running without controls.
      try {
        await recorder.stop();
      } catch {}
      active.current = false;
      if (mounted.current) setRecording(false);
      await resetAudioMode();
      Alert.alert(
        "Recording unavailable",
        "Please check your microphone permission and try again.",
      );
    } finally {
      busy.current = false;
    }
  }

  async function cancelRecord() {
    if (busy.current || !active.current) return;
    busy.current = true;
    try {
      await recorder.stop();
      active.current = false;
      if (mounted.current) setRecording(false);
      await resetAudioMode();
    } catch {
      Alert.alert(
        "Couldn't stop recording",
        "Please try cancelling the voice note again.",
      );
    } finally {
      busy.current = false;
    }
  }

  return {
    recording,
    durationMillis: state.durationMillis,
    isRecording: () => active.current,
    pickPhoto,
    pickFile,
    record,
    cancelRecord,
  };
}
