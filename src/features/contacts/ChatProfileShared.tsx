import React, { useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Message } from "../../domain/data";
import { IconButton } from "../../ui/primitives";
import { ResponsiveImage } from "../../ui/ResponsiveImage";
import { palette, radius, space } from "../../ui/theme";
import VideoAttachment from "../conversations/VideoAttachment";
import { sharedLinks } from "./ChatProfileMetadata";
import { openAttachment } from "../../ui/openAttachment";

async function openSharedUri(uri: string | undefined, document: boolean) {
  if (!uri) {
    Alert.alert(
      "File unavailable",
      "This message does not have a file location",
    );
    return;
  }
  if (!document && !/^https?:\/\//i.test(uri)) {
    Alert.alert("Link unavailable", "Only HTTP and HTTPS links can be opened");
    return;
  }
  if (document) {
    await openAttachment(uri);
    return;
  }
  try {
    await Linking.openURL(uri);
  } catch {
    Alert.alert(
      document ? "Couldn't open document" : "Couldn't open link",
      document
        ? "The file may no longer be available, or no installed app can open it"
        : "Check the address and try again",
    );
  }
}

export default function ChatProfileShared({
  messages,
  dark,
}: {
  messages: Message[];
  dark: boolean;
}) {
  const base = palette(dark);
  const colors = {
    ...base,
    bg: dark ? "#111111" : "#FFFFFF",
    fg: dark ? "#F5F5F5" : "#111111",
    muted: dark ? "#A6A6A6" : "#6B6B6B",
    card: dark ? "#171717" : "#FFFFFF",
    line: dark ? "#2A2A2A" : "#E8E8E8",
    coralInk: dark ? "#F5F5F5" : "#111111",
  };
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<"Media" | "Docs" | "Links">("Media");
  const [selected, setSelected] = useState<Message | null>(null);
  const [failed, setFailed] = useState(false);
  const visible = messages.filter((message) => !message.deleted);
  const media = visible.filter(
    (message) => message.kind === "image" || message.kind === "video",
  );
  const docs = visible.filter((message) => message.kind === "file");
  const links = sharedLinks(messages);
  const counts = {
    Media: media.length,
    Docs: docs.length,
    Links: links.length,
  };
  return (
    <View>
      <Text
        accessibilityRole="header"
        style={[s.heading, { color: colors.fg }]}
      >
        Shared with you
      </Text>
      <View accessibilityRole="tablist" style={s.tabs}>
        {(["Media", "Docs", "Links"] as const).map((name) => (
          <Pressable
            key={name}
            accessibilityRole="tab"
            accessibilityLabel={`${name}, ${counts[name]} ${
              counts[name] === 1 ? "item" : "items"
            }`}
            accessibilityState={{ selected: tab === name }}
            onPress={() => setTab(name)}
            style={[
              s.tab,
              {
                borderBottomColor: tab === name ? colors.coralInk : colors.line,
              },
            ]}
          >
            <Text
              style={[
                s.label,
                { color: tab === name ? colors.fg : colors.muted },
              ]}
            >
              {name} · {counts[name]}
            </Text>
          </Pressable>
        ))}
      </View>
      {!counts[tab] && (
        <Text style={[s.empty, { color: colors.muted }]}>
          No shared {tab === "Docs" ? "documents" : tab.toLowerCase()} yet
        </Text>
      )}
      {tab === "Media" && (
        <View style={s.grid}>
          {media.map((message) => (
            <Pressable
              key={message.id}
              accessibilityRole="button"
              accessibilityLabel={`View ${message.kind} from ${message.time}`}
              onPress={() => {
                if (!message.uri) {
                  Alert.alert(
                    "Media unavailable",
                    "This message has no media location",
                  );
                  return;
                }
                setFailed(false);
                setSelected(message);
              }}
              style={[s.tile, { backgroundColor: colors.card }]}
            >
              {message.kind === "image" && message.uri ? (
                <ResponsiveImage
                  uri={message.uri}
                  variants={message.variants}
                  sourceWidth={message.width}
                  previewUri={message.previewUri}
                  previewWidth={message.previewWidth}
                  displayWidth={130}
                  recyclingKey={message.id}
                  contentFit="cover"
                  style={s.thumbnail}
                />
              ) : (
                <Ionicons
                  name={
                    message.kind === "video"
                      ? "videocam-outline"
                      : "images-outline"
                  }
                  size={32}
                  color={message.uri ? colors.coralInk : colors.muted}
                />
              )}
              <View style={[s.tileLabel, { backgroundColor: colors.scrim }]}>
                {message.kind === "video" ? (
                  <Ionicons
                    name="videocam-outline"
                    size={12}
                    color={colors.onImage}
                  />
                ) : null}
                <Text style={[s.tileText, { color: colors.onImage }]}>
                  {!message.uri
                    ? "Unavailable"
                    : message.kind === "video"
                      ? "Video"
                      : "Image"}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
      {tab === "Docs" &&
        docs.map((message) => (
          <Pressable
            key={message.id}
            accessibilityRole="button"
            accessibilityLabel={`Open ${message.filename || "document"}`}
            onPress={() => void openSharedUri(message.uri, true)}
            style={[s.row, { borderBottomColor: colors.line }]}
          >
            <Ionicons
              name="document-text-outline"
              size={25}
              color={colors.coralInk}
            />
            <View style={s.body}>
              <Text style={[s.label, { color: colors.fg }]}>
                {message.filename || "Document"}
              </Text>
              <Text style={[s.caption, { color: colors.muted }]}>
                {message.time}
              </Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.muted} />
          </Pressable>
        ))}
      {tab === "Links" &&
        links.map((link) => (
          <Pressable
            key={link.id}
            accessibilityRole="link"
            accessibilityLabel={`Open ${link.url}`}
            onPress={() => void openSharedUri(link.url, false)}
            style={[s.row, { borderBottomColor: colors.line }]}
          >
            <Ionicons name="link-outline" size={25} color={colors.coralInk} />
            <View style={s.body}>
              <Text numberOfLines={2} style={[s.label, { color: colors.fg }]}>
                {link.url}
              </Text>
              <Text style={[s.caption, { color: colors.muted }]}>
                {link.time}
              </Text>
            </View>
            <Ionicons name="open-outline" size={18} color={colors.muted} />
          </Pressable>
        ))}
      <Modal
        visible={selected !== null}
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <View style={[s.viewer, { backgroundColor: colors.media }]}>
          <View style={s.viewerHeader}>
            <Text style={[s.viewerTitle, { color: colors.onImage }]}>
              {selected?.filename ||
                (selected?.kind === "video" ? "Shared video" : "Shared image")}
            </Text>
            <IconButton
              name="close"
              label="Close media"
              color={colors.onImage}
              onPress={() => setSelected(null)}
            />
          </View>
          {selected?.uri &&
            (selected.kind === "video" ? (
              <VideoAttachment key={selected.id} uri={selected.uri} />
            ) : failed ? (
              <Text style={[s.viewerTitle, { color: colors.onImage }]}>
                This image could not be loaded
              </Text>
            ) : (
              <ScrollView
                style={s.imageScroll}
                contentContainerStyle={s.imageContent}
                maximumZoomScale={4}
                minimumZoomScale={1}
                centerContent
              >
                <ResponsiveImage
                  accessibilityLabel="Shared image"
                  uri={selected.uri}
                  variants={selected.variants}
                  sourceWidth={selected.width}
                  previewUri={selected.previewUri}
                  previewWidth={selected.previewWidth}
                  displayWidth={width * 4}
                  contentFit="contain"
                  style={s.fullImage}
                  onError={() => setFailed(true)}
                />
              </ScrollView>
            ))}
          <Text style={[s.viewerTime, { color: colors.muted }]}>
            {selected?.time}
          </Text>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  heading: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: space.xxl,
  },
  tabs: { flexDirection: "row", marginVertical: space.lg },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: space.md,
    borderBottomWidth: 2,
  },
  label: { fontSize: 14, fontWeight: "600" },
  caption: {
    fontSize: 12,
    marginTop: space.sm,
  },
  empty: { paddingVertical: space.xl },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tile: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: radius.control,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnail: { width: "100%", height: "100%" },
  tileLabel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: space.xs,
  },
  tileText: { fontSize: 11, fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1 },
  viewer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space.xxxl,
  },
  viewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    width: "100%",
  },
  viewerTitle: {
    flex: 1,
    fontWeight: "600",
    padding: space.md,
  },
  viewerTime: { padding: space.lg },
  imageScroll: { flex: 1, width: "100%" },
  imageContent: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  fullImage: { width: "100%", height: "100%", minHeight: 300 },
});
