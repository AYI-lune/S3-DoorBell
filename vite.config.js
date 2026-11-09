import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base: './' 是关键 —— 打包后 index.html 用相对路径引用资源，
// 直接丢到 GitHub Pages 的 /<仓库名>/ 子目录也能打开。
// 注意：不要用 file:// 双击打开 dist/index.html，浏览器会拦掉 ES module；
// 用 npm run preview 或任意静态服务器。
export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    host: true,
    port: 5173,
  },
})
