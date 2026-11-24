import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-router")) return "router-vendor";
          if (id.includes("react-dom") || id.includes("/react/")) return "react-vendor";
          if (id.includes("bootstrap")) return "bootstrap-vendor";
          if (id.includes("axios")) return "http-vendor";
          return "vendor";
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    testTimeout: 15000,
  },
});
