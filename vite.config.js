import { defineConfig } from 'vite';

// `base: './'` keeps every asset URL relative so the same build works in a
// browser (vite preview) and inside Electron's custom `app://` protocol.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
