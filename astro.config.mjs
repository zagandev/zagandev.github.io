import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'node:url';

const isProduction = process.env.NODE_ENV === 'production';

// The defaults target a project repository at https://<owner>.github.io/web-portfolio/.
// Override both values for a custom domain or a user/organization site:
//   SITE_URL=https://example.com BASE_PATH=/ npm run build
const site = process.env.SITE_URL ?? 'https://zagandev.github.io';
const base = process.env.BASE_PATH ?? (isProduction ?? '/');

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  integrations: [mdx(), sitemap()],
  markdown: {
    shikiConfig: {
      theme: 'github-dark-default',
      wrap: true,
    },
  },
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  },
});
