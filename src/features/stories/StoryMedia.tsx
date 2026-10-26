import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { styles as s } from "./Stories.styles";

type Props = {
  uri: string;
  video?: boolean;
  paused?: boolean;
  preview?: boolean;
  controls?: boolean;
  poster?: string;
  crop?: "fit" | "fill";
  onProgress?: (progress: number) => void;
  onEnd?: () => void;
};

function StoryVideo(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const [error, setError] = useState(false);
  const player = useVideoPlayer(props.uri, (video) => {
    video.loop = !!props.preview;
    video.muted = !props.controls && !!props.preview;
    video.audioMixingMode = "mixWithOthers";
    video.timeUpdateEventInterval = 0.05;
  });
  useEffect(() => {
    const progress = player.addListener("timeUpdate", ({ currentTime }) => {
      if (player.duration > 0 && Number.isFinite(player.duration)) {
        latest.current.onProgress?.(Math.min(1, currentTime / player.duration));
      }
    });
    const ended = player.addListener("playToEnd", () => {
      if (!latest.current.paused) latest.current.onEnd?.();
    });
    const status = player.addListener("statusChange", ({ status }) => {
      setError(status === "error");
    });
    return () => {
      progress.remove();
      ended.remove();
      status.remove();
    };
  }, [player]);
  useEffect(() => {
    if (props.paused) player.pause();
    else player.play();
  }, [player, props.paused]);
  return (
    <View style={s.image} pointerEvents={props.controls ? "auto" : "none"}>
      {props.poster && <Image source={{ uri: props.poster }} style={s.image} contentFit={props.crop === "fill" ? "cover" : "contain"} />}
      <VideoView
        player={player}
        style={s.image}
        contentFit={props.crop === "fill" ? "cover" : "contain"}
        nativeControls={!!props.controls}
        fullscreenOptions={{ enable: false }}
        buttonOptions={{ showBottomBar: true, showSeekForward: false, showSeekBackward: false, showSettings: false }}
        surfaceType="textureView"
      />
      {error && (
        <Text style={s.mediaError}>
          Couldn't play this video. Tap to continue.
        </Text>
      )}
    </View>
  );
}

export function StoryMedia(props: Props) {
  return props.video ? (
    <StoryVideo {...props} />
  ) : (
    <Image source={{ uri: props.uri }} style={s.image} contentFit={props.crop === "fill" ? "cover" : "contain"} />
  );
}
