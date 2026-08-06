// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  site: 'https://isowear.es',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/validar'),
    }),
    react(),
  ],
  vite: {
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client'],
    },
  },
});
