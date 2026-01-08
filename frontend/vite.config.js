// vite.config.ts (or .js)
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      "/auth": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/me": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      // Socket.IO (WebSocket) proxy
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
        changeOrigin: true,
      },
      // Optional health check
      "/health": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
