import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const API_TARGET = "http://127.0.0.1:4010";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
	host: '0.0.0.0',
    port: 5175,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
        // חשוב: מונע בעיות IPv6/localhost שמייצרות AggregateError
        configure: (proxy) => {
          proxy.on("error", (err, _req, _res) => {
            console.error("[proxy] error:", err?.message || err);
          });
        },
      },
    },
  },
});
