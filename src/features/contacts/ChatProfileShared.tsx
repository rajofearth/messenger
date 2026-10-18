import React, { useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Message } from "../../domain/data";
import { IconButton } from "../../ui/primitives";
import { coral, palette } from "../../ui/theme";
import VideoAttachment from "../conversations/VideoAttachment";
import { sharedLinks } from "./ChatProfileMetadata";
import { openAttachment } from "../../ui/openAttachment";

async function openSharedUri(uri: string | undefined, document: boolean) {
  if (!uri) {
    Alert.alert(
      "File unavailable",
      "This message does not have a file location.",
    );
    return;
  }
  if (!document && !/^https?:\/\//i.test(uri)) {
    Alert.alert("Link unavailable", "Only HTTP and HTTPS links can be opened.");
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
        ? "The file may no longer be available, or no installed app can open it."
        : "Check the address and try again.",
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
  const colors = palette(dark);
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
      <Text style={[s.heading, { color: colors.fg }]}>Shared with you</Text>
      <View accessibilityRole="tablist" style={s.tabs}>
        {(["Media", "Docs", "Links"] as const).map((name) => (
          <Pressable
            key={name}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === name }}
            onPress={() => setTab(name)}
            style={[
              s.tab,
              { borderBottomColor: tab === name ? coral : colors.line },
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
          No shared {tab === "Docs" ? "documents" : tab.toLowerCase()} yet.
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
                    "This message has no media location.",
                  );
                  return;
                }
                setFailed(false);
                setSelected(message);
              }}
              style={[s.tile, { backgroundColor: colors.card }]}
            >
              {message.kind === "image" && message.uri ? (
                <Image source={{ uri: message.uri }} style={s.thumbnail} />
              ) : (
                <Ionicons name="videocam-outline" size={32} color={coral} />
              )}
              <View style={s.tileLabel}>
                <Text style={s.tileText}>
                  {message.kind === "video" ? "▶ Video" : "Image"}
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
            <Ionicons name="document-text-outline" size={25} color={coral} />
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
            <Ionicons name="link-outline" size={25} color={coral} />
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
        <View style={s.viewer}>
          <View style={s.viewerHeader}>
            <Text style={s.viewerTitle}>
              {selected?.filename ||
                (selected?.kind === "video" ? "Shared video" : "Shared image")}
            </Text>
            <IconButton
              name="close"
              label="Close media"
              color="#FFF"
              onPress={() => setSelected(null)}
            />
          </View>
          {selected?.uri &&
            (selected.kind === "video" ? (
              <VideoAttachment key={selected.id} uri={selected.uri} />
            ) : failed ? (
              <Text style={s.viewerTitle}>This image could not be loaded.</Text>
            ) : (
              <ScrollView
                style={s.imageScroll}
                contentContainerStyle={s.imageContent}
                maximumZoomScale={4}
                minimumZoomScale={1}
                centerContent
              >
                <Image
                  accessibilityLabel="Shared image"
                  source={{ uri: selected.uri }}
                  resizeMode="contain"
                  style={s.fullImage}
                  onError={() => setFailed(true)}
                />
              </ScrollView>
            ))}
          <Text style={s.viewerTime}>{selected?.time}</Text>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  heading: { fontFamily: "DMSans_700Bold", fontSize: 20, marginTop: 24 },
  tabs: { flexDirection: "row", marginVertical: 16 },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 2,
  },
  label: { fontFamily: "DMSans_500Medium", fontSize: 14 },
  caption: { fontFamily: "DMSans_400Regular", fontSize: 12, marginTop: 6 },
  empty: { fontFamily: "DMSans_400Regular", paddingVertical: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: 12,
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
    padding: 6,
    backgroundColor: "#0009",
  },
  tileText: { color: "#FFF", fontSize: 11, fontFamily: "DMSans_500Medium" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1 },
  viewer: {
    flex: 1,
    backgroundColor: "#101311",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
  },
  viewerHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    width: "100%",
  },
  viewerTitle: {
    flex: 1,
    color: "#FFF",
    fontFamily: "DMSans_500Medium",
    padding: 12,
  },
  viewerTime: { color: "#CCC", padding: 16, fontFamily: "DMSans_400Regular" },
  imageScroll: { flex: 1, width: "100%" },
  imageContent: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  fullImage: { width: "100%", height: "100%", minHeight: 300 },
});
