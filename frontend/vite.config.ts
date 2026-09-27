import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** 前端一律走同源相对路径 /api (与生产「单镜像同源部署」口径一致),
    开发/预览靠代理转发到本机后端, 免配 CORS 也免硬编码地址 */
const apiProxy = {
  '/api': { target: 'http://localhost:8000', changeOrigin: true },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': '/src' },
  },
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    port: 4173,
    proxy: apiProxy,
  },
})
