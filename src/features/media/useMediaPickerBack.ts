import React from "react";
import { BackHandler } from "react-native";

export function useMediaPickerBack({
  preview,
  albumOpen,
  cameraOpen,
  onClose,
  onPreview,
  onAlbum,
  onCamera,
}: {
  preview: boolean;
  albumOpen: boolean;
  cameraOpen: boolean;
  onClose: () => void;
  onPreview: () => void;
  onAlbum: () => void;
  onCamera: () => void;
}) {
  React.useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (preview) return onPreview(), true;
      if (albumOpen) return onAlbum(), true;
      if (cameraOpen) return onCamera(), true;
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [albumOpen, cameraOpen, onAlbum, onCamera, onClose, onPreview, preview]);
}
