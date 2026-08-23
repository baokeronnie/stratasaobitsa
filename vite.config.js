import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base: "./"` makes all built asset paths relative, so the site works
// whether it's served at the root of a domain or under a GitHub Pages
// project path like https://username.github.io/repo-name/.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
