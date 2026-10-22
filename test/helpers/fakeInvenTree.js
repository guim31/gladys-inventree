// -----------------------------------------------------------------------------
// A fake InvenTree behind a `fetch` function, answering the bodies recorded on
// a real server (inventree/inventree 1.6.1, test/fixtures/inventree/1.6.1/) on
// 2026-10-22, with the same status codes for a refused token (401) and a user
// without the role (403), and the same lenient stock removal.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const HOST = 'http://192.0.2.40:8000';
export const TOKEN = 'inv-0123456789abcdef.test-token';
// A user with the "Parts" role only: orders and stock items are a 403.
export const LIMITED_TOKEN = 'inv-0123456789abcdef.limited-token';
// A user without any role: every list is a 403.
export const VIEWER_TOKEN = 'inv-0123456789abcdef.no-role-token';
// 2026-10-22, noon local time: the day the fixtures were recorded.
export const NOW = new Date(2026, 9, 22, 12).getTime();

export const fixture = (name, version = '1.6.1') =>
  readFileSync(new URL(`../fixtures/inventree/${version}/${name}`, import.meta.url), 'utf8');
const json = (name) => JSON.parse(fixture(name));

export const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const OUTSTANDING = [10, 20, 25];

export function createInvenTree() {
  const state = {
    parts: json('parts.json').results,
    stock: json('stock.json').results,
    orders: [...json('po-outstanding.json').results, json('po-complete.json')],
    exchange: json('exchange.json'),
    root: fixture('root.json'),
    down: false,
    html: false,
    pageSize: null,
    // Answer of POST /stock/remove/ when set (e.g. a 403).
    removeStatus: null,
    requests: [],
  };
  const answer = (status, body, type = 'application/json') =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': type },
    });
  const page = (rows, searchParams) => {
    const limit = Math.min(Number(searchParams.get('limit')), state.pageSize ?? 500);
    const offset = Number(searchParams.get('offset'));
    return answer(200, {
      count: rows.length,
      next: null,
      previous: null,
      results: rows.slice(offset, offset + limit),
    });
  };

  function remove(body) {
    for (const { pk, quantity } of body.items) {
      const item = state.stock.find((row) => row.pk === pk);
      // InvenTree empties the item rather than refusing a bigger quantity.
      const taken = Math.min(item.quantity, Number(quantity));
      item.quantity -= taken;
      const part = state.parts.find((row) => row.pk === item.part);
      if (part) {
        part.total_in_stock -= taken;
        part.in_stock -= taken;
      }
    }
    state.stock = state.stock.filter((row) => row.quantity > 0);
    return answer(201, body);
  }

  async function fetch(url, init = {}) {
    const { pathname, searchParams } = new URL(url);
    const path = pathname.replace(/^\/api/, '');
    const method = init.method ?? 'GET';
    state.requests.push(`${method} ${path}?${searchParams}`);
    if (state.down) {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }
    if (state.html) {
      return answer(200, '<html>Login</html>', 'text/html');
    }
    if (path === '/') {
      return answer(200, state.root);
    }
    const auth = init.headers?.Authorization;
    const role = {
      [`Token ${TOKEN}`]: 'all',
      [`Token ${LIMITED_TOKEN}`]: 'parts',
      [`Token ${VIEWER_TOKEN}`]: 'none',
    }[auth];
    if (!role) {
      return answer(401, fixture('unauthorized.json'));
    }
    const forbidden = () => answer(403, fixture('forbidden.json'));
    const may = (what) => role === 'all' || (role === 'parts' && what === 'parts');
    let match;
    if (path === '/part/' && method === 'GET') {
      if (!may('parts')) return forbidden();
      return page(state.parts, searchParams);
    }
    if ((match = path.match(/^\/part\/(\d+)\/$/))) {
      if (!may('parts')) return forbidden();
      const part = state.parts.find((row) => row.pk === Number(match[1]));
      return part ? answer(200, part) : answer(404, fixture('not-found.json'));
    }
    if (path === '/stock/' && method === 'GET') {
      if (!may('stock')) return forbidden();
      const part = searchParams.get('part');
      return page(
        state.stock.filter((row) => !part || row.part === Number(part)),
        searchParams,
      );
    }
    if (path === '/stock/remove/' && method === 'POST') {
      if (!may('stock')) return forbidden();
      if (state.removeStatus) return answer(state.removeStatus, fixture('forbidden.json'));
      return remove(JSON.parse(init.body));
    }
    if (path === '/order/po/') {
      if (!may('orders')) return forbidden();
      return page(
        state.orders.filter((row) => OUTSTANDING.includes(row.status)),
        searchParams,
      );
    }
    if ((match = path.match(/^\/order\/po\/(\d+)\/$/))) {
      if (!may('orders')) return forbidden();
      const order = state.orders.find((row) => row.pk === Number(match[1]));
      return order ? answer(200, order) : answer(404, fixture('not-found.json'));
    }
    if (path === '/currency/exchange/') {
      return answer(200, state.exchange);
    }
    return answer(404, '<html>Not found</html>', 'text/html');
  }

  return {
    fetch,
    state,
    goDown: () => {
      state.down = true;
    },
    goUp: () => {
      state.down = false;
    },
    part: (id) => state.parts.find((row) => row.pk === id),
    /** Set the total stock of a part. */
    setStock: (id, quantity) => {
      const part = state.parts.find((row) => row.pk === id);
      part.total_in_stock = quantity;
      part.in_stock = quantity;
    },
    order: (id) => state.orders.find((row) => row.pk === id),
  };
}
