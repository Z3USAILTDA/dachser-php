import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(Date.now().toString()),
  },
  server: {
    host: "::",
    port: 8080,
    proxy: {
      // Encaminha todas as chamadas /api para o backend Express (porta 3001).
      // Em produção, o reverse proxy do domínio encaminha /api -> backend.
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        timeout: 30000,
        proxyTimeout: 30000,
      },
      // Encaminha as chamadas das telas Olimpo (Movimentação Global, Cobrança, Faturamento)
      // para o mesmo backend Express. Em produção, o reverse proxy também deve encaminhar
      // /api/olimpo -> backend (porta 3001).
      "/api/olimpo": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        timeout: 30000,
        proxyTimeout: 30000,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
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
