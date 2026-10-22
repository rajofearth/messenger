export type AuthMode = "signIn" | "signUp";

export type AuthFailure = {
  title: string;
  message: string;
  missingAccount: boolean;
};

function normalizedHandle(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

/**
 * Turns a Convex Auth failure into copy that tells the user what to do next.
 * Convex reports an unknown username as "InvalidAccountId" before it checks
 * the password, so that case must not be presented as a wrong password.
 */
export function describeAuthFailure(
  error: unknown,
  mode: AuthMode,
  username: string,
): AuthFailure {
  const raw = error instanceof Error ? error.message : "";
  if (mode === "signIn" && /InvalidAccountId|Invalid credentials/i.test(raw)) {
    const handle = normalizedHandle(username);
    return {
      title: "Account not found",
      message: `No account exists for ${handle ? `@${handle}` : "that username"}. Check the spelling, or create an account.`,
      missingAccount: true,
    };
  }
  if (/InvalidSecret/i.test(raw)) {
    return {
      title: "Could not sign in",
      message: "That password is incorrect. Try again.",
      missingAccount: false,
    };
  }
  if (/TooManyFailedAttempts/i.test(raw)) {
    return {
      title: "Too many attempts",
      message: "Wait a few minutes before trying again.",
      missingAccount: false,
    };
  }
  return {
    title: mode === "signIn" ? "Could not sign in" : "Could not create account",
    message: raw.trim() || "Please try again.",
    missingAccount: false,
  };
}
