import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function manualChunks(id) {
  if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
    return "react-vendor";
  }
  if (id.includes("node_modules/pixi.js")) {
    return "pixi-vendor";
  }
  if (id.includes("/src/game/render/") || id.includes("/src/game/gameRenderer.js") || id.includes("/src/game/worldMap.js")) {
    return "game-render";
  }
  if (
    id.includes("/src/game/messageHandlers.js") ||
    id.includes("/src/game/messages/") ||
    id.includes("/src/game/socketApi.js") ||
    id.includes("/src/game/useGameSession.js")
  ) {
    return "game-network";
  }
  if (
    id.includes("/src/game/useBuildingUi.js") ||
    id.includes("/src/game/usePlayerUi.js") ||
    id.includes("/src/game/useSkillUi.js") ||
    id.includes("/src/game/useWorldMapUi.js") ||
    id.includes("/src/game/useRespawnStatus.js") ||
    id.includes("/src/game/useGameShortcuts.js") ||
    id.includes("/src/game/buildingWindows.js") ||
    id.includes("/src/game/playerItems.js") ||
    id.includes("/src/game/targetBlock.js") ||
    id.includes("/src/game/chunkRequests.js")
  ) {
    return "game-ui";
  }
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks
      }
    }
  }
});
