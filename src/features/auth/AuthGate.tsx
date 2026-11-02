import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
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
import { describeAuthFailure } from "./authErrors";
import { messengerRepository } from "../../data/messengerRepository";
import { useDeviceScheme } from "../../state/useDeviceScheme";
import { palette, radius, resolveDark, space } from "../../ui/theme";
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
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    username?: string;
    password?: string;
  }>({});
  const [authError, setAuthError] = useState<{
    title: string;
    message: string;
    missingAccount: boolean;
  } | null>(null);
  const nameInput = useRef<TextInput>(null);
  const usernameInput = useRef<TextInput>(null);
  const passwordInput = useRef<TextInput>(null);
  const base = palette(dark);
  const colors = {
    ...base,
    bg: dark ? "#111111" : "#FFFFFF",
    fg: dark ? "#F5F5F5" : "#111111",
    muted: dark ? "#A6A6A6" : "#6B6B6B",
    card: dark ? "#171717" : "#FFFFFF",
    tint: dark ? "#242424" : "#F4F4F4",
    input: dark ? "#202020" : "#F4F4F4",
    switchTrackOn: dark ? "#F5F5F5" : "#111111",
    onCoral: dark ? "#111111" : "#FFFFFF",
    coralInk: dark ? "#F5F5F5" : "#111111",
  };

  async function submit() {
    const nextErrors: typeof fieldErrors = {};
    if (mode === "signUp" && !name.trim()) nextErrors.name = "Enter your name.";
    if (!username.trim()) nextErrors.username = "Enter your username.";
    if (!password) nextErrors.password = "Enter your password.";
    setFieldErrors(nextErrors);
    setAuthError(null);
    if (Object.keys(nextErrors).length > 0) {
      if (nextErrors.name) nameInput.current?.focus();
      else if (nextErrors.username) usernameInput.current?.focus();
      else passwordInput.current?.focus();
      return;
    }
    Keyboard.dismiss();
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
      setAuthError(describeAuthFailure(error, mode, username));
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextMode: "signIn" | "signUp") {
    if (busy || nextMode === mode) return;
    setMode(nextMode);
    setFieldErrors({});
    setAuthError(null);
  }

  function updateField(
    field: "name" | "username" | "password",
    value: string,
  ) {
    if (field === "name") {
      setName(value);
      if (mode === "signUp" && !usernameEdited) setUsername(usernameFromName(value));
    } else if (field === "username") {
      setUsernameEdited(true);
      setUsername(value);
    } else {
      setPassword(value);
    }
    setFieldErrors((current) => {
      const next = { ...current, [field]: undefined };
      if (field === "name" && mode === "signUp" && !usernameEdited) {
        next.username = undefined;
      }
      return next;
    });
    setAuthError(null);
  }

  const inputStyle = (field: keyof typeof fieldErrors) => [
    s.input,
    {
      color: colors.fg,
      backgroundColor: colors.input,
      borderColor: fieldErrors[field] ? colors.danger : "transparent",
    },
  ];

  const errorText = (field: keyof typeof fieldErrors) =>
    fieldErrors[field] ? (
      <Text accessibilityRole="alert" style={[s.fieldError, { color: colors.danger }]}>
        {fieldErrors[field]}
      </Text>
    ) : null;
  const submitLabel = authError
    ? "Try again"
    : mode === "signIn"
      ? "Sign in"
      : "Create account";

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
        <View style={[s.logo, { backgroundColor: colors.fg }]}>
          <Ionicons name="chatbubble-ellipses" size={34} color={colors.bg} />
        </View>
        <Text style={[s.title, { color: colors.fg }]}>Welcome to Messenger</Text>
        <Text style={[s.subtitle, { color: colors.muted }]}>
          Conversations that stay with you across your signed-in devices
        </Text>
        <View
          accessibilityRole="tablist"
          style={[s.modeSwitcher, { backgroundColor: colors.input }]}
        >
          {([
            ["signIn", "Sign in"],
            ["signUp", "Create account"],
          ] as const).map(([value, label]) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: mode === value, disabled: busy }}
              disabled={busy}
              onPress={() => changeMode(value)}
              style={[s.modeTab, mode === value && { backgroundColor: colors.fg }]}
            >
              <Text style={[s.modeTabText, { color: mode === value ? colors.bg : colors.muted }]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        {mode === "signUp" && (
          <View>
            <TextInput
              ref={nameInput}
              accessibilityLabel="Name"
              accessibilityHint={fieldErrors.name ?? "The name people will see"}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              importantForAutofill="yes"
              placeholder="Your name"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={(value) => updateField("name", value)}
              onSubmitEditing={() => usernameInput.current?.focus()}
              returnKeyType="next"
              style={inputStyle("name")}
            />
            {errorText("name")}
          </View>
        )}
        <View>
          <TextInput
            ref={usernameInput}
            accessibilityLabel="Username"
            accessibilityHint={fieldErrors.username ?? "Enter the username for your account"}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            importantForAutofill="yes"
            placeholder="Username"
            placeholderTextColor={colors.muted}
            value={username}
            onChangeText={(value) => updateField("username", value)}
            onSubmitEditing={() => passwordInput.current?.focus()}
            returnKeyType="next"
            style={inputStyle("username")}
          />
          {errorText("username")}
        </View>
        <View
          style={[
            s.passwordRow,
            {
              backgroundColor: colors.input,
              borderColor: fieldErrors.password ? colors.danger : "transparent",
            },
          ]}
        >
          <TextInput
            ref={passwordInput}
            accessibilityLabel="Password"
            accessibilityHint={
              fieldErrors.password ??
              (mode === "signIn" ? "Enter your password" : "Choose a password")
            }
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={mode === "signIn" ? "current-password" : "new-password"}
            textContentType={mode === "signIn" ? "password" : "newPassword"}
            importantForAutofill="yes"
            placeholder="Password"
            placeholderTextColor={colors.muted}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={(value) => updateField("password", value)}
            onSubmitEditing={() => void submit()}
            returnKeyType="done"
            style={[s.passwordInput, { color: colors.fg }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            accessibilityState={{ checked: showPassword, disabled: busy }}
            hitSlop={10}
            disabled={busy}
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
        {errorText("password")}
        {authError ? (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            style={[s.authError, { backgroundColor: colors.dangerSoft }]}
          >
            <Text style={[s.authErrorTitle, { color: colors.danger }]}>{authError.title}</Text>
            <Text style={[s.authErrorMessage, { color: colors.fg }]}>{authError.message}</Text>
            {authError.missingAccount && mode === "signIn" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create an account instead"
                disabled={busy}
                onPress={() => {
                  setUsernameEdited(true);
                  changeMode("signUp");
                }}
                style={s.errorAction}
              >
                <Text style={[s.errorActionText, { color: colors.danger }]}>Create an account instead</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={() => void submit()}
          style={[s.primary, { backgroundColor: colors.switchTrackOn, opacity: busy ? 0.65 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onCoral} />
          ) : (
            <Text style={[s.primaryText, { color: colors.onCoral }]}>
              {submitLabel}
            </Text>
          )}
        </Pressable>
        <Text style={[s.note, { color: colors.muted }]}>
          Your username is how people find you. Keep your password safe; there
          is no signed-out password reset.
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
    const colors = {
      ...palette(dark),
      bg: dark ? "#111111" : "#FFFFFF",
      coralInk: dark ? "#F5F5F5" : "#111111",
    };
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
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: space.xxl,
    gap: space.md,
  },
  logo: {
    alignSelf: "center",
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  title: {
    textAlign: "center",
    fontSize: 28,
    fontWeight: "600",
  },
  subtitle: {
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: space.md,
  },
  modeSwitcher: {
    flexDirection: "row",
    borderRadius: radius.control,
    padding: space.xs,
    marginBottom: space.xs,
  },
  modeTab: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.control - space.xs,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.sm,
  },
  modeTabText: { fontSize: 14, fontWeight: "600" },
  input: {
    borderRadius: radius.control,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    fontSize: 16,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.control,
    borderWidth: 1,
  },
  passwordInput: {
    flex: 1,
    paddingLeft: space.lg,
    paddingVertical: space.lg,
    fontSize: 16,
  },
  reveal: { paddingHorizontal: space.lg, paddingVertical: space.lg },
  fieldError: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: -space.sm,
    marginBottom: space.xs,
    paddingHorizontal: space.xs,
  },
  authError: {
    borderRadius: radius.control,
    padding: space.md,
    gap: space.xs,
  },
  authErrorTitle: { fontSize: 14, fontWeight: "600" },
  authErrorMessage: { fontSize: 13, lineHeight: 19 },
  errorAction: { alignSelf: "flex-start", marginTop: space.xs },
  errorActionText: { fontSize: 13, fontWeight: "600" },
  primary: {
    minHeight: 52,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.xs,
  },
  primaryText: { fontSize: 16, fontWeight: "600" },
  link: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: space.xs,
  },
  note: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    marginTop: space.sm,
  },
});
