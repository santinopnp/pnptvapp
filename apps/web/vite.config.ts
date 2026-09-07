import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";

function swBuildIdPlugin() {
  return {
    name: "sw-build-id",
    closeBundle() {
      // sha alone would leave CACHE_NAME unchanged across rebuilds without a
      // commit, so existing browsers never see a new SW and keep serving a
      // stale index.html that references chunks the rebuild renamed. Suffix
      // with build epoch so every rebuild — committed or not — produces a
      // unique cache name and triggers the SW update flow.
      const sha = execSync("git rev-parse --short HEAD").toString().trim();
      const swPath = path.resolve(__dirname, "dist/sw.js");
      try {
        const content = readFileSync(swPath, "utf-8");
        const buildId = `${sha}-${Date.now()}`;
        // First-time (placeholder still present) and re-run (already a real id)
        // are both handled by matching everything after "pnptv-" up to the
        // closing quote.
        const replaced = content.replace(/pnptv-[^']+/g, `pnptv-${buildId}`);
        writeFileSync(swPath, replaced);
      } catch { /* sw.js not in dist — skip */ }
    },
  };
}

export default defineConfig({
  plugins: [react(), swBuildIdPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/react-router-dom")) return "vendor";
          if (id.includes("node_modules/oidc-client-ts")) return "auth";
          if (id.includes("node_modules/hls.js")) return "media";
          if (id.includes("@livekit/") || id.includes("node_modules/livekit-client")) return "livekit";
          if (id.includes("node_modules/socket.io-client")) return "socket";
        },
      },
    },
  },
});
