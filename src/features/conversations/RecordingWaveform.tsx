import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { coral } from "../../ui/theme";

export default function RecordingWaveform({ metering }: { metering?: number }) {
  const [bars, setBars] = useState<number[]>(Array(18).fill(5));
  useEffect(() => {
    const timer = setInterval(() => {
      // Without device metering this is an activity animation, not audio amplitude.
      const level =
        metering === undefined
          ? 0.2 + Math.random() * 0.65
          : Math.max(0.05, Math.min(1, (metering + 60) / 60));
      setBars((old) => [...old.slice(1), 4 + level * 25]);
    }, 140);
    return () => clearInterval(timer);
  }, [metering]);
  return (
    <View
      style={styles.wave}
      accessible
      accessibilityLabel={
        metering === undefined
          ? "Recording activity animation"
          : "Recording audio level"
      }
    >
      {bars.map((height, index) => (
        <View
          key={index}
          style={{ width: 3, height, borderRadius: 2, backgroundColor: coral }}
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
    gap: 2,
    height: 32,
    overflow: "hidden",
  },
});
