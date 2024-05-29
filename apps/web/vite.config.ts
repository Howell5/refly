import { sentryVitePlugin } from "@sentry/vite-plugin"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"
import postcss from "./postcss.config.js"
import { vitePluginForArco } from "@refly/arco-vite-plugin-react"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    vitePluginForArco({
      theme: "@arco-themes/react-refly-ai",
    }),
    sentryVitePlugin({
      org: "refly-ai",
      project: "web",
      errorHandler: err => console.warn(err),
    }),
  ],
  css: {
    postcss,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    sourcemap: true,
    minify: "terser",
    terserOptions: {
      compress: {
        // drop_console: true,
        // drop_debugger: true,
      },
    },
  },
  // esbuild: {
  //   drop: ["console", "debugger"],
  // },
})
