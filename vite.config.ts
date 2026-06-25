import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "path";

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: "./src/Routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  server: {
    port: 8080,
    host: true,
  },
  build: {
    outDir: "dist",
    // Single-page app — Cloudflare Pages will serve index.html for all routes
  },
  resolve: {
    alias: [
      { find: /^@\/components\/ui\/(.+)$/, replacement: path.resolve(__dirname, "./src/componenets/ui/$1") },
      { find: "@/components/ui", replacement: path.resolve(__dirname, "./src/componenets/ui") },
      { find: "@/components", replacement: path.resolve(__dirname, "./src/componenets") },
      { find: "@/integrations/supabase", replacement: path.resolve(__dirname, "./src/integration/supbase") },
      { find: "@/integrations/lovable", replacement: path.resolve(__dirname, "./src/integration/lovable") },
      { find: "@/integrations", replacement: path.resolve(__dirname, "./src/integration") },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
    dedupe: ["react", "react-dom"],
  },
});
