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
        external: [
          "electron",
          "electron-log",
          "electron-store",
          "pdf-parse",
          "node:path",
          "node:fs",
          "node:fs/promises",
          "node:url",
          "node:child_process",
          "node:os",
          /^node:/,
        ],
        output: {
          format: "es",
        },
      },
    },
    resolve: {
      // 不使用别名，使用相对路径
      mainFields: ["module", "main"],
    },
  },
  preload: {
    build: {
      outDir: "dist-electron/preload",
      rollupOptions: {
        input: resolve(rootDir, "electron/preload/index.ts"),
        external: ["electron"],
        output: {
          format: "cjs", // preload 脚本通常使用 CommonJS
        },
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
