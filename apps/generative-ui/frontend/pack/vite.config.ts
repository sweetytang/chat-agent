import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// __dirname = .../apps/human-in-the-loop/frontend/pack
const FRONTEND_DIR = path.resolve(__dirname, "..");      // frontend/
const PROJECT_DIR = path.resolve(__dirname, "../..");     // apps/human-in-the-loop/
const MONOREPO_ROOT = path.resolve(__dirname, "../../../.."); // monorepo root

export default defineConfig({
    root: FRONTEND_DIR,
    plugins: [react()],
    resolve: {
        alias: {
            "@/": MONOREPO_ROOT + "/",
            "@common": path.resolve(PROJECT_DIR, "common"),
            "@frontend": FRONTEND_DIR,
            "@backend": path.resolve(PROJECT_DIR, "backend"),
        },
    },
    server: {
        port: 8007,
        open: false,
    },
    build: {
        outDir: path.resolve(PROJECT_DIR, "dist"),
        emptyOutDir: true,
    },
    css: {
        modules: {
            localsConvention: 'camelCaseOnly',
        },
        preprocessorOptions: {
            scss: {
                api: 'modern-compiler',
            },
        },
    },
});
