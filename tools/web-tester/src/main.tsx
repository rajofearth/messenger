import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { convex, convexUrl } from "./convex";
import App from "./App";
import "./styles.css";

function ConfigError() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark">!</div>
        <h1>Convex URL is missing</h1>
        <p className="auth-subtitle">
          Add <code>EXPO_PUBLIC_CONVEX_URL</code> to the repository&apos;s{" "}
          <code>.env.local</code>, then restart <code>npm run web:dev</code>.
        </p>
        <p className="auth-note">
          The web tester reads the same deployment URL as the mobile app.
        </p>
      </section>
    </main>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("The root element is missing.");

createRoot(container).render(
  <StrictMode>
    {convex ? (
      <ConvexAuthProvider client={convex}>
        <App />
      </ConvexAuthProvider>
    ) : (
      <ConfigError />
    )}
  </StrictMode>,
);

if (convexUrl) {
  document.documentElement.dataset.convexUrl = convexUrl;
}
