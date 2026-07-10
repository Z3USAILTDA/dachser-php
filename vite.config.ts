import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

function copyApiPlugin() {
  return {
    name: "copy-api",
    closeBundle() {
      const src = path.resolve(__dirname, "api");
      const dest = path.resolve(__dirname, "dist/api");
      if (fs.existsSync(src)) {
        fs.cpSync(src, dest, { recursive: true });
        console.log("API directory copied to dist/api");
      }
    },
  };
}

export default defineConfig(() => ({
  base: "/",
  build: {
    chunkSizeWarningLimit: 2000,
  },
  define: {
    __APP_VERSION__: JSON.stringify(Date.now().toString()),
  },
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        timeout: 120000,
        proxyTimeout: 120000,
      },
    },
  },
  plugins: [react(), copyApiPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Shim Node built-ins for the browser so xlsx-js-style (which does
      // `require('stream')` at import time) doesn't break Excel import/export.
      stream: "stream-browserify",
      events: "events",
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  optimizeDeps: {
    include: ["stream-browserify", "events"],
  },
}));
