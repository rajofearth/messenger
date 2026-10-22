import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

function username(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const handle = username(params.username ?? params.email);
        if (!/^[a-z0-9_]{3,30}$/.test(handle)) {
          throw new Error(
            "Use a username with 3 to 30 letters, numbers, or underscores.",
          );
        }
        const name = String(params.name ?? "").trim();
        if (params.flow === "signUp" && !name) {
          throw new Error("Enter your name before creating an account.");
        }
        return {
          email: handle,
          ...(params.flow === "signUp"
            ? { name, username: handle }
            : { username: handle }),
        };
      },
      validatePasswordRequirements(password) {
        if (password.length < 8) {
          throw new Error("Your password must be at least 8 characters.");
        }
      },
    }),
  ],
});
