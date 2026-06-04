import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    include: ['pdfjs-dist', 'mammoth', 'xlsx', 'jszip', 'marked'],
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          pdfjs: ['pdfjs-dist'],
          supabase: ['@supabase/supabase-js'],
          parsers: ['mammoth', 'xlsx', 'jszip'],
        },
      },
    },
  },
});
