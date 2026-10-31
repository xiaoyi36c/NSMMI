import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // 桌面端按 chunk 缓存：React 运行时与业务代码分离，重打包只变更业务 chunk
    rollupOptions: {
      output: {
        manualChunks(id) {
          // 需匹配 react-dom/client、scheduler 等真实模块路径
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
            return "react";
          }
          // antd 与其底层 rc-* 依赖单独成 chunk，业务变更不影响组件库缓存
          if (/node_modules[\\/](antd|@ant-design[\\/][^\\/]+|rc-[a-z-]+|@rc-component[\\/][^\\/]+)[\\/]/.test(id)) {
            return "antd";
          }
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
