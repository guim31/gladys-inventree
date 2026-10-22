// -----------------------------------------------------------------------------
// The REST API of InvenTree (`<base>/api/...`), the few calls the integration
// needs.
//
// Facts checked on a real server (inventree/inventree 1.6.1, API 561, see
// test/fixtures/inventree/1.6.1/):
// - `Authorization: Token <token>`; the token is created in the user profile
//   (or `GET /api/user/token/` with basic auth);
// - `GET /api/` answers without any token: it tells the version only;
// - a list answers a bare array, or `{ count, next, previous, results }` once
//   `limit` is given: always page, a big inventory is thousands of rows;
// - a wrong token is a 401 `{"detail":"Invalid token."}`, a user without the
//   role a 403 `{"detail":"You do not have permission..."}`;
// - `POST /api/stock/remove/` does NOT refuse a quantity above the item's:
//   it answers 201 and empties the item (and deletes it when
//   `delete_on_deplete`). The caller checks the quantity first.
// -----------------------------------------------------------------------------

export const DEFAULT_TIMEOUT = 20_000;
export const PAGE_SIZE = 500;
// A bound against a server answering a wrong `count` forever: past it, the
// read fails rather than count part of the inventory.
const MAX_PAGES = 200;

export class InvenTreeError extends Error {
  /**
   * @param {'unreachable' | 'unauthorized' | 'forbidden' | 'not_found' | 'timeout' | 'http' | 'invalid'} kind
   * @param {string} message never carries a credential
   * @param {number} [status]
   */
  constructor(kind, message, status) {
    super(message);
    this.name = 'InvenTreeError';
    this.kind = kind;
    this.status = status;
  }
}

/** The first readable message of a DRF error body (`detail`, or a field error). */
function detailOf(data) {
  if (!data || typeof data !== 'object') {
    return '';
  }
  if (typeof data.detail === 'string') {
    return data.detail;
  }
  for (const value of Object.values(data)) {
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value) && typeof value[0] === 'string') {
      return value[0];
    }
  }
  return '';
}

export class InvenTreeClient {
  /**
   * @param {object} options
   * @param {string} options.url normalized base URL (see normalizeUrl)
   * @param {string} options.token API token
   * @param {typeof fetch} [options.fetch]
   * @param {number} [options.timeout]
   */
  constructor({ url, token, fetch: fetchImpl, timeout }) {
    this.url = url;
    this.token = token;
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.timeout = timeout ?? DEFAULT_TIMEOUT;
  }

  /** `<method> <base>/api<path>`, parsed JSON. */
  async request(method, path, body) {
    let response;
    const headers = { Accept: 'application/json', Authorization: `Token ${this.token}` };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    try {
      response = await this.fetch(`${this.url}/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeout),
        // A redirect means a login page or another server, never data.
        redirect: 'manual',
      });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new InvenTreeError('timeout', `No answer from InvenTree within ${this.timeout} ms`);
      }
      // Never the message of an error raised before sending: it may quote the
      // Authorization header.
      const cause = err?.cause?.code ?? err?.name ?? 'error';
      throw new InvenTreeError('unreachable', `InvenTree unreachable (${cause})`);
    }
    let raw;
    try {
      raw = await response.text();
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new InvenTreeError('timeout', `No answer from InvenTree within ${this.timeout} ms`);
      }
      raw = '';
    }
    const where = path.split('?')[0];
    let data;
    try {
      data = raw === '' ? null : JSON.parse(raw);
    } catch {
      data = undefined;
    }
    const status = response.status;
    if (status === 401) {
      throw new InvenTreeError('unauthorized', `${where}: HTTP 401`, status);
    }
    if (status === 403) {
      throw new InvenTreeError('forbidden', `${where}: HTTP 403`, status);
    }
    if (status >= 300 && status < 400) {
      throw new InvenTreeError('invalid', `${where}: redirected (is this the InvenTree address?)`);
    }
    if (status === 404) {
      throw new InvenTreeError('not_found', `${where}: HTTP 404`, status);
    }
    if (status < 200 || status >= 300) {
      const detail = detailOf(data);
      throw new InvenTreeError(
        'http',
        `${where}: HTTP ${status}${detail ? `: ${detail.slice(0, 120)}` : ''}`,
        status,
      );
    }
    if (data === undefined) {
      // A proxy login page answering 200 in HTML, for instance.
      throw new InvenTreeError('invalid', `${where}: the answer is not JSON (is this InvenTree?)`);
    }
    return data;
  }

  get(path) {
    return this.request('GET', path);
  }

  /**
   * Every row of a list, page after page.
   * @param {string} path e.g. `/part/`
   * @param {Record<string, string>} [query]
   */
  async list(path, query = {}) {
    const rows = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const params = new URLSearchParams({
        ...query,
        limit: String(PAGE_SIZE),
        offset: String(rows.length),
      });
      const data = await this.get(`${path}?${params}`);
      if (!data || !Array.isArray(data.results)) {
        throw new InvenTreeError('invalid', `${path}: InvenTree did not answer a list`);
      }
      rows.push(...data.results);
      const count = Number(data.count);
      if (data.results.length === 0 || !Number.isFinite(count) || rows.length >= count) {
        return rows;
      }
    }
    throw new InvenTreeError('invalid', `${path}: more than ${MAX_PAGES} pages`);
  }

  /** `{ server: "InvenTree", version, apiVersion, ... }`, without token. */
  info() {
    return this.get('/');
  }

  /** Active parts (the inactive ones are retired from the catalog). */
  parts() {
    return this.list('/part/', { active: 'true' });
  }

  part(id) {
    return this.get(`/part/${encodeURIComponent(id)}/`);
  }

  /** The stock items in stock (for the value and the removal). */
  stock(query = {}) {
    return this.list('/stock/', { in_stock: 'true', ...query });
  }

  /** Purchase orders not received nor cancelled yet. */
  outstandingOrders() {
    return this.list('/order/po/', { outstanding: 'true' });
  }

  order(id) {
    return this.get(`/order/po/${encodeURIComponent(id)}/`);
  }

  /** `{ base_currency, exchange_rates: { USD: 1.12, ... } }` */
  exchange() {
    return this.get('/currency/exchange/');
  }

  /** @param {{ pk: number, quantity: string }[]} items */
  removeStock(items, notes) {
    return this.request('POST', '/stock/remove/', { items, notes });
  }
}
