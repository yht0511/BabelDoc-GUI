import { defineConfig } from "electron-vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const rendererRoot = resolve(rootDir, "src");

export default defineConfig({
  main: {
    build: {
      outDir: "dist-electron/main",
      rollupOptions: {
        input: resolve(rootDir, "electron/main/index.ts"),
        external: ["electron", "electron-log", "pdf-parse", /node_modules/],
      },
    },
  },
  preload: {
    build: {
      outDir: "dist-electron/preload",
      rollupOptions: {
        input: resolve(rootDir, "electron/preload/index.ts"),
      },
    },
  },
  renderer: {
    root: rendererRoot,
    build: {
      outDir: resolve(rootDir, "dist"),
      rollupOptions: {
        input: resolve(rendererRoot, "index.html"),
      },
    },
    resolve: {
      alias: {
        "@": rendererRoot,
      },
    },
    plugins: [react()],
    server: {
      port: 5173,
    },
  },
});
