import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // FIX: Thêm alias này để chắc chắn Vite tìm đúng gói buffer
      buffer: "buffer/",
    },
  },
  // FIX: Định nghĩa global để tránh lỗi thư viện cũ
  define: {
    global: "globalThis",
  },
}));
