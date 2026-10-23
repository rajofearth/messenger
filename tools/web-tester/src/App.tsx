import { useConvexAuth } from "@convex-dev/auth/react";
import AuthScreen from "./AuthScreen";
import Tester from "./Tester";

export default function App() {
  const { isLoading, isAuthenticated } = useConvexAuth();

  if (isLoading) {
    return (
      <main className="auth-shell">
        <div className="loading-card">
          <span className="spinner" />
          <span>Checking your session…</span>
        </div>
      </main>
    );
  }

  return isAuthenticated ? <Tester /> : <AuthScreen />;
}
