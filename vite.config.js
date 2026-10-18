import { defineConfig } from "vite";

export default defineConfig({
  // Relative base is required for GitHub Pages project sites.
  base: "./",
  build: {
    chunkSizeWarningLimit: 1000,
  },
});
