// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const REFRESH_MINUTES = ['5', '15', '30', '60'];
// Which parts get a device of their own.
export const PART_DEVICES = ['none', 'starred', 'minimum'];

export const DEFAULT_CONFIG = {
  url: '',
  api_token: '',
  refresh_minutes: '15',
  part_devices: 'starred',
  allow_stock_removal: false,
  language: 'fr',
};

/**
 * Turn what the user typed into the base URL of InvenTree, without `/api`:
 * - `192.0.2.10:8000` or `inventree.local` (no scheme): http, that port;
 * - `https://example.org/inventree/`: exactly that address (reverse proxy).
 * A pasted `/api` or `/web` suffix is dropped. Returns null when not usable.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (text === '') {
    return null;
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  let url;
  try {
    url = new URL(hasScheme ? text : `http://${text}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.hostname === '') {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) {
    // Credentials in the URL would end up in logs and error messages.
    return null;
  }
  const path = url.pathname
    .replace(/\/+$/, '')
    .replace(/\/(api|web|platform)$/i, '')
    .replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${path}`;
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const typed = text(source.url);
  const url = normalizeUrl(typed);
  // A token pasted with its scheme ("Token inv-...") works as well.
  const apiToken = text(source.api_token)
    .replace(/^(token|bearer)\s+/i, '')
    // Spaces, line breaks and control characters cannot be part of a token.
    // eslint-disable-next-line no-control-regex
    .replace(/[\s\x00-\x1f\x7f]+/g, '');
  const refresh = String(source.refresh_minutes ?? '');
  const removal = source.allow_stock_removal;
  return {
    url,
    urlInvalid: typed !== '' && url === null,
    apiToken,
    refreshMinutes: Number(
      REFRESH_MINUTES.includes(refresh) ? refresh : DEFAULT_CONFIG.refresh_minutes,
    ),
    partDevices: PART_DEVICES.includes(source.part_devices)
      ? source.part_devices
      : DEFAULT_CONFIG.part_devices,
    allowStockRemoval: removal === true || removal === 'true',
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
