import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: {
    port: 3000,
  },
  // Resolve the "@/*" alias from tsconfig.json natively (no plugin needed).
  resolve: {
    tsconfigPaths: true,
  },
  // better-sqlite3 is a native module; keep it (and the Prisma adapter) out of
  // the bundle so they load from node_modules at runtime on the server.
  ssr: {
    external: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
  },
  plugins: [tanstackStart(), viteReact(), tailwindcss()],
});
