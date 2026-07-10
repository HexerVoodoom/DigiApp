import { defineConfig } from 'vite';
import path from 'node:path';

// Renderer do overlay. `base: './'` porque o Electron carrega via file://.
// Sprites 128×128 são pequenos: deixamos o Vite inlinar em base64 (evita
// problemas de caminho relativo dentro do pacote do electron-builder).
export default defineConfig({
  root: path.resolve(__dirname, 'renderer'),
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist-renderer'),
    emptyOutDir: true,
    assetsInlineLimit: 65536,
  },
});
