import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    base: '/', // Ensure absolute paths
    plugins: [react()],
    root: '.', // Root directory
    publicDir: 'public', // Public directory
    build: {
      outDir: 'dist'
    },
    server: {
      port: 5173,
      host: true
    }
  };
});