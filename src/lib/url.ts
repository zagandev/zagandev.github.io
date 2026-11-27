/** Prefix an internal path with Astro's configured base path. */
export function url(path: string): string {
  if (
    /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(path) ||
    path.startsWith('mailto:') ||
    path.startsWith('tel:')
  ) {
    return path;
  }

  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}` || '/';
}

/** Strip the base path from a runtime pathname, for matching navigation state. */
export function currentPath(pathname: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  if (base && pathname.startsWith(base)) {
    return pathname.slice(base.length) || '/';
  }
  return pathname;
}

/** Build an absolute URL from a site origin and a base-aware internal path. */
export function absoluteUrl(path: string, site: URL): string {
  return new URL(url(path), site).href;
}
