import { defineConfig } from "vite";

// Repo name is used as the base path so the built site works under
// https://<usuario>.github.io/my-finances-web/ (GitHub Pages project sites
// are served from a subpath, unlike local dev which is served from "/").
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/my-finances-web/" : "/",
}));
