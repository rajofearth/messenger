import { Alert, Linking, Platform } from "react-native";
import * as Sharing from "expo-sharing";

export async function openAttachment(uri: string, filename?: string) {
  try {
    if (/^https?:\/\//i.test(uri) || Platform.OS === "web") {
      await Linking.openURL(uri);
      return;
    }
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert(
        "Sharing unavailable",
        "This device cannot open the attachment with another app.",
      );
      return;
    }
    await Sharing.shareAsync(uri, {
      dialogTitle: filename
        ? `Open or share ${filename}`
        : "Open or share attachment",
    });
  } catch {
    Alert.alert(
      "Attachment unavailable",
      "The local file may have been removed. Please select and attach it again.",
    );
  }
}
