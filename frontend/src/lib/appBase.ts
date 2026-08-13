export const APP_BASE: string =
  new URL(document.querySelector('base')?.getAttribute('href') ?? '/', location.origin)
    .pathname.replace(/\/$/, '');

export const apiUrl = (path: string): string => `${APP_BASE}/api/${path.replace(/^\/+/, '')}`;
