import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { CORAL, styles } from "./CallScreen.styles";
import Control from "./CallControl";
import CallScreenCamera from "./CallScreenCamera";
import { Avatar } from "../../ui/primitives";
import { useAvatarUri } from "../../ui/useAvatarUri";
import { imageCacheKey } from "../../domain/imageVariants";

export type CallScreenProps = {
  name: string;
  avatar: string;
  video: boolean;
  seconds: number;
  /** Confirmed call state, shared with the system notification. */
  muted: boolean;
  speaker: boolean;
  onMuteChange: (value: boolean) => void;
  onSpeakerChange: (value: boolean) => void;
  onBack: () => void;
  onEnd: () => void;
  onChat: () => void;
};


function duration(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export default function CallScreen({
  name,
  avatar,
  video,
  seconds,
  muted,
  speaker,
  onMuteChange,
  onSpeakerChange,
  onBack,
  onEnd,
  onChat,
}: CallScreenProps) {
  const [cameraOn, setCameraOn] = useState(video);
  const [frontCamera, setFrontCamera] = useState(true);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [remoteFailed, setRemoteFailed] = useState(false);
  const avatarUri = useAvatarUri(avatar);
  useEffect(() => {
    setRemoteFailed(false);
  }, [avatar]);

  const showingVideo = cameraOn;
  const displayName = name.trim() || "Your contact";
  const backdropUri = avatarUri?.replace(/w=\d+/, "w=1080");
  const backdropKey = backdropUri ? imageCacheKey(backdropUri) : undefined;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#161B20" />
      {showingVideo && !remoteFailed && avatarUri && (
        <Image
          source={{ uri: backdropUri, cacheKey: backdropKey }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          allowDownscaling
          recyclingKey={backdropKey ?? backdropUri}
          accessible={false}
          onError={() => setRemoteFailed(true)}
        />
      )}
      <LinearGradient
        colors={
          showingVideo && !remoteFailed
            ? [
                "rgba(12,17,21,0.72)",
                "rgba(12,17,21,0.03)",
                "rgba(12,17,21,0.25)",
                "#10171EF2",
              ]
            : ["#303333", "#25272B", "#131A21", "#10171E"]
        }
        locations={[0, 0.35, 0.58, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back to conversation"
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="chevron-back" size={25} color="#FFFFFF" />
          </Pressable>
          <View style={styles.headerIdentity}>
            <Text style={styles.name} numberOfLines={1}>
              {displayName}
            </Text>
            <View style={styles.connection}>
              <View style={styles.connectionDot} />
              <Text style={styles.connectionText}>
                Connected · {duration(seconds)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.stage}>
          {(!showingVideo || remoteFailed) && (
            <View style={styles.audioIdentity}>
              <View style={styles.avatarHalo}>
                <View style={styles.avatarRing}>
                  <Avatar uri={avatar} name={displayName} size={140} />
                </View>
              </View>
              <Text style={styles.audioName}>{displayName}</Text>
              <Text style={styles.audioSubtitle}>
                {showingVideo ? "Video preview unavailable" : "Audio call"}
              </Text>
            </View>
          )}
          {showingVideo && (
            <View style={styles.preview}>
              <CallScreenCamera front={frontCamera} />
              <LinearGradient
                pointerEvents="none"
                colors={["transparent", "#00000099"]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.previewLabel}>
                <Text style={styles.youText}>You</Text>
                <Ionicons
                  name={muted ? "mic-off" : "mic"}
                  size={13}
                  color="#FFFFFF"
                />
              </View>
            </View>
          )}
        </View>

        <View style={styles.bottom}>
          <View style={styles.callNote}>
            <View style={styles.smallDot} />
            <Text style={styles.callNoteText}>
              Demo call · Local preview only · No audio or video sent
            </Text>
          </View>
          <View style={styles.dock}>
            <BlurView
              intensity={45}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.dockTint} />
            <View style={styles.controls}>
              <Control
                icon={cameraOn ? "videocam-outline" : "videocam-off-outline"}
                label={cameraOn ? "Turn video off" : "Turn video on"}
                active={!cameraOn}
                onPress={() => setCameraOn((value) => !value)}
              />
              <Control
                icon={muted ? "mic-off-outline" : "mic-outline"}
                label={muted ? "Turn microphone on" : "Turn microphone off"}
                active={muted}
                onPress={() => onMuteChange(!muted)}
              />
              <Control
                icon="chatbubble-outline"
                label="Open chat"
                onPress={onChat}
              />
              <Control
                icon="ellipsis-horizontal"
                label="More options"
                active={optionsVisible}
                onPress={() => setOptionsVisible(true)}
              />
              <Control icon="call" label="End call" danger onPress={onEnd} />
            </View>
          </View>
        </View>
      </SafeAreaView>

      <Modal
        visible={optionsVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setOptionsVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close call options"
            onPress={() => setOptionsVisible(false)}
          />
          <SafeAreaView
            edges={["bottom", "left", "right"]}
            style={styles.sheet}
            accessibilityViewIsModal
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeading}>
              <Text style={styles.sheetTitle} accessibilityRole="header">
                Call options
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close call options"
                onPress={() => setOptionsVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={23} color="#FFFFFF" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              <View style={styles.optionRow}>
                <View style={styles.optionIcon}>
                  <Ionicons
                    name={speaker ? "volume-high-outline" : "ear-outline"}
                    size={23}
                    color={CORAL}
                  />
                </View>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionTitle}>Speaker</Text>
                  <Text style={styles.optionSubtitle}>
                    {speaker ? "Speaker selected" : "Earpiece selected"}
                  </Text>
                </View>
                <Switch
                  value={speaker}
                  onValueChange={onSpeakerChange}
                  trackColor={{ false: "#4A4D52", true: CORAL }}
                  thumbColor="#FFFFFF"
                  accessibilityLabel="Use speaker"
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${frontCamera ? "rear" : "front"} camera`}
                onPress={() => setFrontCamera((value) => !value)}
                style={({ pressed }) => [
                  styles.optionRow,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.optionIcon}>
                  <Ionicons
                    name="camera-reverse-outline"
                    size={24}
                    color={CORAL}
                  />
                </View>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionTitle}>Switch camera</Text>
                  <Text style={styles.optionSubtitle}>
                    {frontCamera
                      ? "Front camera selected"
                      : "Rear camera selected"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={19} color="#A7ABB0" />
              </Pressable>
              <View style={styles.simulationNotice}>
                <Ionicons
                  name="information-circle-outline"
                  size={20}
                  color={CORAL}
                />
                <Text style={styles.simulationText}>
                  The camera shows a live local preview when enabled. No video
                  is recorded or sent. Microphone and speaker controls are
                  simulated; no call audio is captured.
                </Text>
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}
