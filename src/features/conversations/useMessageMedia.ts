import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import type { Message } from "../../domain/data";
import type { PickedStoryMedia } from "../stories/storyPickerModel";
import type { KeyboardMedia } from "../../ui/KeyboardMediaInput";
import { saveKeyboardMedia } from "../../services/keyboardMedia";

export function useMessageMedia(onSend: (message: Partial<Message>) => void) {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const state = useAudioRecorderState(recorder, 200);
  const [recording, setRecording] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
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

  function pickPhoto(_camera = false) {
    if (busy.current || active.current) return;
    setPickerOpen(true);
  }

  function closePicker() {
    setPickerOpen(false);
  }

  function pickMedia(items: PickedStoryMedia[]) {
    if (busy.current || active.current || !items.length) return;
    const albumId =
      items.length > 1
        ? `album-${Date.now()}-${Math.random().toString(36).slice(2)}`
        : undefined;
    for (const item of items) {
      onSend({
        kind: item.video ? "video" : "image",
        uri: item.uri,
        filename: item.filename,
        albumId,
        width: item.width,
        height: item.height,
        duration: item.duration,
      });
    }
    setPickerOpen(false);
  }

  function receiveKeyboardMedia(media: KeyboardMedia) {
    if (!mounted.current || active.current || busy.current) return;
    try {
      onSend(saveKeyboardMedia(media));
    } catch {
      Alert.alert(
        "Could not attach keyboard media",
        "Choose a GIF or image under 25 MB and try again.",
      );
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
          onSend({
            kind: "audio",
            uri: recorder.uri,
            duration: seconds,
            mimeType: "audio/mp4",
            filename: "voice-note.m4a",
          });
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
    pickerOpen,
    closePicker,
    pickMedia,
    durationMillis: state.durationMillis,
    metering: state.metering,
    isRecording: () => active.current,
    pickPhoto,
    receiveKeyboardMedia,
    pickFile,
    record,
    cancelRecord,
  };
}
