import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    // root: "../", // 修正 Vite 项目的根目录，让它回到 package.json 这一级来寻找 index.html
    plugins: [react()],
    server: {
        port: 8000,
        open: true,
    },
    css: {
        modules: {
            localsConvention: 'camelCaseOnly', // 导出驼峰命名的 class
        },
        preprocessorOptions: {
            scss: {
                api: 'modern-compiler', // 推荐使用现代编译 API
            },
        },
    },
});
