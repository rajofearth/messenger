import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { errorMessage } from "./util";

type Mode = "signIn" | "signUp";

function usernameFromName(name: string): string {
  const handle = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  return handle.length >= 3 ? handle : "";
}

export default function AuthScreen() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<Mode>("signIn");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const handle = username.trim().replace(/^@/, "").toLowerCase();
    if (!handle || !password) {
      setError("Enter your username and password.");
      return;
    }
    if (mode === "signUp" && !name.trim()) {
      setError("Enter the name you want people to see.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await signIn("password", {
        email: handle,
        username: handle,
        name: name.trim(),
        password,
        flow: mode,
      });
    } catch (signInError) {
      setError(errorMessage(signInError));
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setMode((current) => (current === "signIn" ? "signUp" : "signIn"));
    setError(null);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark">M</div>
        <p className="eyebrow">Local test tool</p>
        <h1>{mode === "signIn" ? "Welcome back" : "Create a test account"}</h1>
        <p className="auth-subtitle">
          Sign in as a second person and talk to the account on your phone. Both
          sides use the same Convex deployment.
        </p>

        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          {mode === "signUp" && (
            <label className="field">
              <span>Name</span>
              <input
                autoComplete="name"
                autoFocus
                placeholder="Web Tester"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (!usernameEdited) {
                    setUsername(usernameFromName(event.target.value));
                  }
                }}
              />
            </label>
          )}
          <label className="field">
            <span>Username</span>
            <div className="input-with-prefix">
              <span>@</span>
              <input
                autoCapitalize="none"
                autoComplete="username"
                autoCorrect="off"
                placeholder="your_username"
                value={username}
                onChange={(event) => {
                  setUsernameEdited(true);
                  setUsername(event.target.value);
                }}
              />
            </div>
          </label>
          <label className="field">
            <span>Password</span>
            <input
              autoCapitalize="none"
              autoComplete={
                mode === "signIn" ? "current-password" : "new-password"
              }
              placeholder="At least 8 characters"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button className="primary-button" disabled={busy} type="submit">
            {busy
              ? "Please wait…"
              : mode === "signIn"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <button className="text-button" onClick={switchMode} type="button">
          {mode === "signIn"
            ? "New here? Create an account"
            : "Already have an account? Sign in"}
        </button>

        <p className="auth-note">
          The reusable test account is <code>webtester_2026</code>. Its password
          is in <code>tools/web-tester/.env.local</code>. There is deliberately
          no signed-out password reset.
        </p>
      </section>
    </main>
  );
}
