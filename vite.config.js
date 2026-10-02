import { defineConfig } from 'vite';

// 使用相对路径，便于部署到 GitHub Pages 子路径
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
});
