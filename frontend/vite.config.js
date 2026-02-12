import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_PROXY_TARGET = process.env.VITE_PROXY_TARGET || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2020",
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          grid: ["ag-grid-community", "ag-grid-react"],
          charts: ["plotly.js-basic-dist", "react-plotly.js"],
        },
      },
    },
  },
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: API_PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
});
