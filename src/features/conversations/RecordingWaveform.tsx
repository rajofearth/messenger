import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

const STATIC_BARS = [8, 12, 18, 10, 22, 14, 9, 17, 24, 13, 20, 11, 16, 8, 19, 12, 22, 10];

export default function RecordingWaveform({
  metering,
  color = "#111111",
}: {
  metering?: number;
  color?: string;
}) {
  const [bars, setBars] = useState<number[]>(STATIC_BARS);
  const meteringRef = useRef(metering);
  meteringRef.current = metering;
  useEffect(() => {
    if (metering === undefined) {
      setBars(STATIC_BARS);
      return;
    }
    const timer = setInterval(() => {
      const level = Math.max(
        0.05,
        Math.min(1, ((meteringRef.current ?? -60) + 60) / 60),
      );
      setBars((old) => [...old.slice(1), 4 + level * 25]);
    }, 140);
    return () => clearInterval(timer);
  }, [metering === undefined]);
  return (
    <View
      style={styles.wave}
      accessible
      accessibilityLabel={
        metering === undefined
          ? "Recording waveform"
          : "Recording audio level"
      }
    >
      {bars.map((height, index) => (
        <View
          key={index}
          style={{ width: 4, height, borderRadius: 2, backgroundColor: color }}
        />
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  wave: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: 32,
    overflow: "hidden",
  },
});
