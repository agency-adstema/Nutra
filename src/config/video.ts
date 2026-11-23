/** A single public origin for every product video and poster. Change this
 * constant when video.zdravica.xx replaces the public r2.dev URL. */
export const VIDEO_BASE_URL = 'https://pub-a95ebe33417d48d0a699465ca5028b61.r2.dev/Limited%20Charm';

export function videoR2Url(relativePath: string): string {
  // Important: preserve the already-encoded "Limited%20Charm" in base URL;
  // encode each *relative* path segment exactly once, including spaces.
  const path = relativePath.replace(/\\/g, '/');
  if (!path || path.startsWith('/') || path.split('/').some(x => !x || x === '.' || x === '..')
      || /[?#]/.test(path)) throw new Error('Invalid R2 video path');
  return `${VIDEO_BASE_URL}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
