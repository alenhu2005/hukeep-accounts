import { defineConfig } from 'vite';

export default defineConfig({
  base: '/hukeep-accounts/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
