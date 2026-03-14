import { defineConfig } from 'vite'
// import vue from '@vitejs/plugin-vue' // 以Vue项目为例
// import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
    plugins: [
        vue(),
        // 关键：加上这个插件，所有东西都会被打包进 index.html
        viteSingleFile()
    ],
    // 可选：调整资源内联的大小限制，但插件通常会自动处理
    build: {
        assetsInlineLimit: 4096 // 默认4kb以下资源内联为base64
    }
})
