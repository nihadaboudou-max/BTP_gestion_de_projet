import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      "@workspace/api-client-react": path.resolve(import.meta.dirname, "..", "..", "lib", "api-client-react", "src", "index.ts"),
      "@workspace/api-zod": path.resolve(import.meta.dirname, "..", "..", "lib", "api-zod", "src", "index.ts"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port: Number(process.env.PORT) || 4173,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
