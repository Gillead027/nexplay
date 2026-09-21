import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A versão publicada é gravada em apps/web/build-info.json na hora do deploy (commit e data).
// Sem o arquivo (desenvolvimento local) a tela Sobre diz que não é uma versão publicada.
const buildInfoPath = fileURLToPath(new URL('./build-info.json', import.meta.url));
const buildInfo = existsSync(buildInfoPath)
  ? (JSON.parse(readFileSync(buildInfoPath, 'utf8')) as { commit: string; builtAt: string | null })
  : { commit: 'desenvolvimento', builtAt: null };

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo),
  },
  build: {
    chunkSizeWarningLimit: 600,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // Precisa vir antes de '/api' — Vite casa por prefixo na ordem de
      // inserção, e só esta entrada tem ws:true pra fazer o upgrade de
      // WebSocket (a entrada genérica de /api abaixo é só HTTP comum).
      '/api/realtime': {
        target: 'ws://localhost:3000',
        ws: true,
      },
      '/api': 'http://localhost:3000',
      '/livekit': {
        target: 'ws://localhost:7880',
        ws: true,
        rewrite: (path) => path.replace(/^\/livekit/, ''),
      },
    },
  },
});
