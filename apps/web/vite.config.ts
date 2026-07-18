import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";

function swBuildIdPlugin() {
  return {
    name: "sw-build-id",
    closeBundle() {
      const sha = execSync("git rev-parse --short HEAD").toString().trim();
      const swPath = path.resolve(__dirname, "dist/sw.js");
      try {
        const content = readFileSync(swPath, "utf-8");
        writeFileSync(swPath, content.replace(/pnptv-__BUILD_ID__/g, `pnptv-${sha}`));
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
