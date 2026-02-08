// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // Будет открываться как https://profit-group.online/aok/graph2-debug/
  // (важно: со слэшем на конце)
  base: "/aok/graph2-debug/",

  plugins: [react()],

  server: {
    fs: {
      allow: [".."],
    },
  },

  resolve: {
    alias: {
      graph2: path.resolve(__dirname, "../graph2/src"),
      wizard: path.resolve(__dirname, "../wizard/src"),
    },
  },
});