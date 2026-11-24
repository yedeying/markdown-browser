import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      // 文件夹即站点：iframe 走的静态站点路由也要代理到同一后端
      '/site': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
      // 外部运行时插件资产代理
      '/plugins': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
    },
  },
})
