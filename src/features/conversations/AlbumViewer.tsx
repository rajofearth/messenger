import React, { useState } from "react";
import { Modal, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { Message } from "../../domain/data";
import { IconButton } from "../../ui/primitives";
import { ResponsiveImage } from "../../ui/ResponsiveImage";
import { palette, space } from "../../ui/theme";
import { AlbumItem } from "./MediaAlbum";
import type { MessageBubbleProps } from "./MessageBubble";
import VideoAttachment from "./VideoAttachment";

type Props = Pick<MessageBubbleProps, "onActions"> & {
  messages: Message[];
  initialId: string;
  dark: boolean;
  visible: boolean;
  onClose: () => void;
};

export default function AlbumViewer({ messages, initialId, dark, visible, onClose, onActions }: Props) {
  const [selectedId, setSelectedId] = useState(initialId);
  const { width } = useWindowDimensions();
  const colors = palette(dark);
  const found = messages.findIndex((message) => message.id === selectedId);
  const index = Math.max(0, found);
  const message = messages[index];
  return (
    <Modal
      visible={visible && !!message}
      animationType="fade"
      supportedOrientations={["portrait", "landscape", "landscape-left", "landscape-right"]}
      onRequestClose={onClose}
    >
      <View style={[s.root, { backgroundColor: colors.media }]}>
        <View style={s.toolbar}>
          <Text accessibilityLiveRegion="polite" style={[s.text, { color: colors.onImage }]}>{index + 1} of {messages.length}</Text>
          <IconButton name="close" label="Close album" color={colors.onImage} onPress={onClose} />
        </View>
        {visible && message && (
          <AlbumItem
            key={message.id}
            dark={dark}
            message={message}
            visible={visible}
            onActions={(target) => { onClose(); onActions(target); }}
            onOpen={() => {}}
            label={`${message.kind === "video" ? "Video" : "Photo"} ${index + 1} of ${messages.length}`}
            style={s.media}
          >
            {message.uri ? message.kind === "video" ? (
              <VideoAttachment uri={message.uri} />
            ) : (
              <ResponsiveImage
                uri={message.uri}
                variants={message.variants}
                sourceWidth={message.width}
                previewUri={message.previewUri}
                previewWidth={message.previewWidth}
                displayWidth={width}
                recyclingKey={message.id}
                style={s.image}
                contentFit="contain"
              />
            ) : <Text style={[s.text, { color: colors.onImage }]}>Media unavailable</Text>}
          </AlbumItem>
        )}
        {!!message?.text && <Text style={[s.text, s.caption, { color: colors.onImage }]}>{message.text}</Text>}
        {!!message?.reaction && <Text style={[s.text, { color: colors.onImage }]}>{message.reaction}</Text>}
        <View style={s.paging}>
          <IconButton
            name="chevron-back" label="Previous media" color={index > 0 ? colors.onImage : colors.muted}
            onPress={() => { if (index > 0) setSelectedId(messages[index - 1].id); }}
          />
          <Text style={[s.text, { color: colors.onImage }]}>{message?.kind === "video" ? "Video" : "Photo"}</Text>
          <IconButton
            name="chevron-forward" label="Next media" color={index < messages.length - 1 ? colors.onImage : colors.muted}
            onPress={() => { if (index < messages.length - 1) setSelectedId(messages[index + 1].id); }}
          />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingTop: 48, paddingBottom: space.xxl, alignItems: "center" },
  toolbar: { width: "100%", paddingHorizontal: space.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  text: { fontSize: 16 },
  media: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  caption: { padding: space.md },
  paging: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", paddingHorizontal: space.lg },
});
