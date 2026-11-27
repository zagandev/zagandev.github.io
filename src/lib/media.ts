import { url } from '@/lib/url';

/**
 * Resolve a frontmatter media path to an emitted, base-aware asset URL.
 *
 * Project entries keep owner-supplied paths such as
 * `/src/assets/projects/<slug>/clip.mp4`. Vite emits those files into the
 * static build; this helper maps them to the emitted URL so the same entries
 * work in both dev and production without duplicating media in `public/`.
 * Absolute/external URLs are returned unchanged.
 */
const assetUrls = import.meta.glob<string>(
  '/src/assets/projects/**/*.{png,jpg,jpeg,webp,avif,gif,mp4}',
  { eager: true, query: '?url', import: 'default' },
);

const assetPrefix = '/src/assets/projects/';

export function mediaUrl(src: string): string {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) return src;

  const normalized = src.trim().replace(/\\/g, '/');
  let relative = normalized;
  if (relative.startsWith(assetPrefix)) {
    relative = relative.slice(assetPrefix.length);
  } else if (relative.startsWith('src/assets/projects/')) {
    relative = relative.slice('src/assets/projects/'.length);
  } else if (relative.startsWith('./')) {
    relative = relative.slice(2);
  }

  // Vite already prefixes emitted asset URLs with Astro's configured base.
  const emitted = assetUrls[`${assetPrefix}${relative}`];
  return emitted ?? url(src);
}
