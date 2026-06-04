import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    include: ['pdfjs-dist', 'mammoth', 'xlsx', 'jszip', 'marked'],
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('pdfjs-dist')) return 'pdfjs';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('mammoth') || id.includes('xlsx') || id.includes('jszip')) return 'parsers';
          if (id.includes('@google/generative-ai')) return 'gemini';
        },
      },
    },
  },
});
