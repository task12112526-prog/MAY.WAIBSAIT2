import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const file = id.replace(/\\/g, '/');
            if (!file.includes('/node_modules/')) return;
            if (file.includes('/recharts/')) return 'charts';
            if (file.includes('/@mui/icons-material/')) return 'mui-icons';
            if (file.includes('/@mui/') || file.includes('/@emotion/')) return 'mui';
            if (file.includes('/@supabase/')) return 'supabase';
            if (file.includes('/@tanstack/')) return 'query';
            if (file.includes('/react/') || file.includes('/react-dom/') || file.includes('/react-router/')) return 'react-vendor';
          },
        },
      },
    },
  };
});
