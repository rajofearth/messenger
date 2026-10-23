import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");

/**
 * The web tester is a local development tool. It reuses the Convex URL that
 * the mobile build already reads from the repository's .env.local, so there is
 * one deployment to configure instead of two.
 */
export default defineConfig({
  root: here,
  plugins: [react()],
  // Load the repository's .env.local; EXPO_PUBLIC_* values are public.
  envDir: repo,
  envPrefix: ["VITE_", "EXPO_PUBLIC_"],
  server: {
    host: "0.0.0.0",
    port: 5174,
    strictPort: true,
    fs: {
      // The generated Convex API lives outside the Vite root.
      allow: [repo],
    },
  },
  build: {
    outDir: path.join(here, "dist"),
    emptyOutDir: true,
  },
});
