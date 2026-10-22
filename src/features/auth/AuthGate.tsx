import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { messengerRepository } from "../../data/messengerRepository";
import { useDeviceScheme } from "../../state/useDeviceScheme";
import { coral, palette, resolveDark } from "../../ui/theme";
import type { ThemePreference } from "../../ui/theme";

function usernameFromName(name: string) {
  const handle = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  return handle.length >= 3 ? handle : "";
}

function AuthForm({ dark }: { dark: boolean }) {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const colors = palette(dark);

  async function submit() {
    if (!username.trim() || !password) {
      Alert.alert("Missing details", "Enter your username and password.");
      return;
    }
    if (mode === "signUp" && !name.trim()) {
      Alert.alert("Add your name", "Enter the name you want people to see.");
      return;
    }
    setBusy(true);
    try {
      await signIn("password", {
        email: username.trim().replace(/^@/, "").toLowerCase(),
        username: username.trim().replace(/^@/, "").toLowerCase(),
        name: name.trim(),
        password,
        flow: mode,
      });
    } catch (error) {
      Alert.alert(
        mode === "signIn" ? "Could not sign in" : "Could not create account",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[s.logo, { backgroundColor: colors.tint }]}>
          <Ionicons name="chatbubble-ellipses" size={34} color={colors.coralInk} />
        </View>
        <Text style={[s.title, { color: colors.fg }]}>Welcome to Messenger</Text>
        <Text style={[s.subtitle, { color: colors.muted }]}>
          Private conversations that stay with you across your signed-in devices.
        </Text>
        {mode === "signUp" && (
          <TextInput
            accessibilityLabel="Name"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            importantForAutofill="yes"
            placeholder="Your name"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={(value) => {
              setName(value);
              if (mode === "signUp" && !usernameEdited) {
                setUsername(usernameFromName(value));
              }
            }}
            style={[s.input, { color: colors.fg, backgroundColor: colors.card }]}
          />
        )}
        <TextInput
          accessibilityLabel="Username"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          importantForAutofill="yes"
          placeholder="Username"
          placeholderTextColor={colors.muted}
          value={username}
          onChangeText={(value) => {
            setUsernameEdited(true);
            setUsername(value);
          }}
          style={[s.input, { color: colors.fg, backgroundColor: colors.card }]}
        />
        <View style={[s.passwordRow, { backgroundColor: colors.card }]}>
          <TextInput
            accessibilityLabel="Password"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={
              mode === "signIn" ? "current-password" : "new-password"
            }
            textContentType={mode === "signIn" ? "password" : "newPassword"}
            importantForAutofill="yes"
            placeholder="Password"
            placeholderTextColor={colors.muted}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            style={[s.passwordInput, { color: colors.fg }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            hitSlop={10}
            onPress={() => setShowPassword((value) => !value)}
            style={s.reveal}
          >
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={colors.muted}
            />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void submit()}
          style={[s.primary, { opacity: busy ? 0.65 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onCoral} />
          ) : (
            <Text style={[s.primaryText, { color: colors.onCoral }]}>
              {mode === "signIn" ? "Sign in" : "Create account"}
            </Text>
          )}
        </Pressable>
        {mode === "signIn" && (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() =>
              Alert.alert(
                "Password recovery is unavailable",
                "You can change your password only while you are signed in. If you forget it while signed out, this account and its conversations cannot be recovered.",
              )
            }
          >
            <Text style={[s.link, { color: colors.coralInk }]}>Forgot password?</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => setMode(mode === "signIn" ? "signUp" : "signIn")}
        >
          <Text style={[s.link, { color: colors.muted }]}>
            {mode === "signIn"
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </Text>
        </Pressable>
        <Text style={[s.note, { color: colors.muted }]}>
          Your username is how people find you. Keep your password safe; there is
          deliberately no signed-out password reset.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const scheme = useDeviceScheme();
  const [storedTheme, setStoredTheme] = useState<ThemePreference>("system");

  // The auth screen is the first thing a cold start paints, so it follows the
  // same appearance preference the signed-in app will use. Reading it needs
  // no session; a failed read keeps the device scheme.
  useEffect(() => {
    if (isAuthenticated) return;
    let active = true;
    void messengerRepository
      .loadAppearance()
      .then((appearance) => {
        if (active && appearance) setStoredTheme(appearance.theme);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isAuthenticated]);

  const dark = resolveDark(storedTheme, scheme);

  if (isLoading) {
    const colors = palette(dark);
    return (
      <SafeAreaView style={[s.loading, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.coralInk} size="large" />
      </SafeAreaView>
    );
  }
  if (!isAuthenticated) return <AuthForm dark={dark} />;
  // Cached chats render while the profile query is still in flight, so an
  // offline start still shows the local copy instead of a spinner.
  return <>{children}</>;
}

const s = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { flexGrow: 1, justifyContent: "center", padding: 28, gap: 14 },
  logo: {
    alignSelf: "center",
    width: 76,
    height: 76,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  title: {
    textAlign: "center",
    fontFamily: "DMSans_700Bold",
    fontSize: 29,
  },
  subtitle: {
    textAlign: "center",
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  input: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontFamily: "DMSans_400Regular",
    fontSize: 16,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
  },
  passwordInput: {
    flex: 1,
    paddingLeft: 16,
    paddingVertical: 15,
    fontFamily: "DMSans_400Regular",
    fontSize: 16,
  },
  reveal: { paddingHorizontal: 14, paddingVertical: 14 },
  primary: {
    minHeight: 54,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: coral,
    marginTop: 4,
  },
  primaryText: { fontFamily: "DMSans_700Bold", fontSize: 16 },
  link: {
    textAlign: "center",
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    paddingVertical: 5,
  },
  note: {
    textAlign: "center",
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
});
