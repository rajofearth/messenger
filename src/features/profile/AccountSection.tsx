import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { messengerRepository } from "../../data/messengerRepository";
import { clearLocalAccountFiles } from "../../services/accountCleanup";
import { styles, type SettingsColors } from "./SettingsScreen.styles";

type Dialog = "password" | "devices" | null;

function reason(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("CURRENT_PASSWORD_INVALID"))
    return "The current password is not correct.";
  if (message.includes("PASSWORD_TOO_SHORT"))
    return "Use at least 8 characters for the new password.";
  if (message.includes("PASSWORD_UNCHANGED"))
    return "Choose a password that differs from the current one.";
  if (message.includes("DEVICE_TOO_NEW"))
    return "A device can manage other devices only after it has been signed in for 24 hours.";
  if (message.includes("CANNOT_REVOKE_CURRENT_DEVICE"))
    return "This device cannot remove itself. Use Sign out instead.";
  return "The server could not complete this request. Check your connection and try again.";
}

/**
 * Account controls: password change, signed-in device management and sign out.
 * Device removal is deliberately gated by the server until the current device
 * has been registered for a day.
 */
export default function AccountSection({
  colors,
}: {
  colors: SettingsColors;
}) {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuthActions();
  const changePassword = useAction(api.security.changePassword);
  const revokeDevice = useMutation(api.devices.revokeDevice);
  const unregister = useMutation(api.devices.unregister);
  const devices = useQuery(api.devices.list, {});
  const [dialog, setDialog] = useState<Dialog>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setDialog(null);
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  async function savePassword() {
    if (busy) return;
    if (!current || !next) {
      Alert.alert("Missing details", "Enter your current and new password.");
      return;
    }
    if (next !== confirm) {
      Alert.alert("Passwords differ", "The new passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      setDialog(null);
      setCurrent("");
      setNext("");
      setConfirm("");
      Alert.alert("Password changed", "Use the new password next time you sign in.");
    } catch (error) {
      Alert.alert("Password not changed", reason(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeDevice(id: string) {
    setRevoking(id);
    try {
      await revokeDevice({ deviceId: id as Id<"devices"> });
      Alert.alert("Device signed out", "That device can no longer read this account.");
    } catch (error) {
      Alert.alert("Device not removed", reason(error));
    } finally {
      setRevoking(null);
    }
  }

  function confirmSignOut() {
    Alert.alert(
      "Sign out?",
      "Messages stay on the server. This device's local copy is removed so the next account cannot read it.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await unregister({}).catch(() => {});
                await signOut();
              } catch {
                Alert.alert(
                  "Sign out failed",
                  "This device may still be signed in. Local messages were removed anyway; check your connection and try again.",
                );
              } finally {
                await messengerRepository.clearAccountData().catch(() => {});
                await clearLocalAccountFiles().catch(() => {});
              }
            })();
          },
        },
      ],
    );
  }

  function row(
    title: string,
    subtitle: string,
    icon: React.ComponentProps<typeof Ionicons>["name"],
    action: () => void,
    danger = false,
  ) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={action}
        style={({ pressed }) => [styles.row, { opacity: pressed ? 0.65 : 1 }]}
      >
        <View style={[styles.rowIcon, { backgroundColor: colors.tint }]}>
          <Ionicons
            name={icon}
            size={21}
            color={danger ? "#C76161" : colors.text}
          />
        </View>
        <View style={styles.rowCopy}>
          <Text
            style={[
              styles.rowTitle,
              { color: danger ? "#C76161" : colors.text },
            ]}
          >
            {title}
          </Text>
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
            {subtitle}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    );
  }

  const currentDevice = devices?.find((device) => device.current);
  const canManage = !!currentDevice?.eligible;

  return (
    <>
      <Text style={[styles.section, { color: colors.muted }]}>ACCOUNT</Text>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {row(
          "Change password",
          "Only while signed in; there is no signed-out reset",
          "key-outline",
          () => setDialog("password"),
        )}
        <View style={[styles.divider, { backgroundColor: colors.line }]} />
        {row(
          canManage
            ? "Signed-in devices"
            : "Signed-in devices · available after 24 hours",
          devices === undefined
            ? "Loading devices"
            : `${devices.length} active ${devices.length === 1 ? "device" : "devices"}`,
          "phone-portrait-outline",
          () => setDialog("devices"),
        )}
        <View style={[styles.divider, { backgroundColor: colors.line }]} />
        {row(
          "Sign out",
          "Remove this account's local messages from the device",
          "log-out-outline",
          confirmSignOut,
          true,
        )}
      </View>
      <Text style={[styles.note, { color: colors.muted }]}>
        Forgetting your password while signed out loses the account: there is no
        recovery address or reset link. Change it here while you still know it.
      </Text>

      <Modal
        visible={dialog !== null}
        transparent
        animationType="fade"
        onRequestClose={close}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View
            style={[
              styles.modal,
              {
                backgroundColor: colors.card,
                marginTop: insets.top,
                marginBottom: insets.bottom,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {dialog === "password" ? "Change password" : "Signed-in devices"}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close dialog"
                disabled={busy}
                hitSlop={10}
                onPress={close}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            {dialog === "password" ? (
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={[styles.modalBody, { color: colors.muted }]}>
                  Changing the password keeps this device signed in. Other
                  devices stay signed in until you remove them.
                </Text>
                {[
                  { label: "Current password", value: current, set: setCurrent },
                  { label: "New password", value: next, set: setNext },
                  { label: "Confirm new password", value: confirm, set: setConfirm },
                ].map((field) => (
                  <View key={field.label}>
                    <Text style={[styles.label, { color: colors.text }]}>
                      {field.label}
                    </Text>
                    <TextInput
                      accessibilityLabel={field.label}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry
                      value={field.value}
                      onChangeText={field.set}
                      editable={!busy}
                      style={[
                        styles.input,
                        { color: colors.text, backgroundColor: colors.input },
                      ]}
                    />
                  </View>
                ))}
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void savePassword()}
                  style={[styles.primary, { opacity: busy ? 0.65 : 1 }]}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.onCoral} />
                  ) : (
                    <Text style={styles.primaryText}>Change password</Text>
                  )}
                </Pressable>
              </ScrollView>
            ) : (
              <ScrollView>
                {!canManage && (
                  <Text style={[styles.note, { color: colors.muted }]}>
                    This device must be signed in for 24 hours before it can
                    remove other devices. Signed-in devices are listed below.
                  </Text>
                )}
                {devices === undefined && (
                  <ActivityIndicator color={colors.text} />
                )}
                {devices?.map((device) => (
                  <View
                    key={device.id}
                    style={[s.device, { borderBottomColor: colors.line }]}
                  >
                    <Ionicons
                      name="phone-portrait-outline"
                      size={24}
                      color={device.current ? colors.text : colors.muted}
                    />
                    <View style={styles.rowCopy}>
                      <Text style={[styles.rowTitle, { color: colors.text }]}>
                        {device.label}
                        {device.current ? " · This device" : ""}
                      </Text>
                      <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
                        {device.platform} · signed in{" "}
                        {new Date(device.registeredAt).toLocaleDateString()}
                      </Text>
                    </View>
                    {!device.current && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Sign out ${device.label}`}
                        disabled={!canManage || revoking === device.id}
                        onPress={() => void removeDevice(device.id)}
                        style={{
                          opacity: canManage ? 1 : 0.35,
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                        }}
                      >
                        {revoking === device.id ? (
                          <ActivityIndicator size="small" color="#C76161" />
                        ) : (
                          <Text style={{ color: "#C76161", fontSize: 12 }}>
                            Remove
                          </Text>
                        )}
                      </Pressable>
                    )}
                  </View>
                ))}
                {devices?.length === 0 && (
                  <Text style={[styles.note, { color: colors.muted }]}>
                    No signed-in devices were reported yet.
                  </Text>
                )}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  device: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
