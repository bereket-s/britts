import { defineConfig, loadEnv } from 'vite';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Serves the Vercel Edge Function in api/gemini.js from `vite` and `vite preview`, so the app
 * behaves the same locally as on Vercel. GEMINI_API_KEY is read from .env, as the server-side key.
 */
function localApi() {
  const file = resolve('api/gemini.js');

  const middleware = async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const request = new Request(`http://${req.headers.host}/api/gemini`, {
        method: req.method,
        headers: req.headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
      });
      // The mtime query busts Node's import cache so edits to api/gemini.js apply without a restart.
      const { default: handler } = await import(`${pathToFileURL(file).href}?v=${statSync(file).mtimeMs}`);
      const response = await handler(request);

      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) {
        const reader = response.body.getReader();
        res.on('close', () => reader.cancel().catch(() => {}));
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
    } catch (err) {
      console.error('[api/gemini]', err);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Local API error: ${err.message}` }));
    }
  };

  return {
    name: 'local-api',
    config(_, { mode }) {
      const env = loadEnv(mode, process.cwd(), '');
      if (!process.env.GEMINI_API_KEY && env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
    },
    configureServer(server) {
      server.middlewares.use('/api/gemini', middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/gemini', middleware);
    },
  };
}

export default defineConfig({
  plugins: [localApi()],
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
        },
      },
    },
  },
});
