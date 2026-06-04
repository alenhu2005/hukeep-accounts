import { defineConfig } from 'vite';

export default defineConfig({
  base: '/hukeep-accounts/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'DYNAMIC_IMPORT_WILL_NOT_MOVE_MODULE') return;
        warn(warning);
      },
    },
  },
});
