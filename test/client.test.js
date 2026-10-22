// The InvenTree client and the configuration, on the answers recorded on a
// real server (test/fixtures/inventree/1.6.1/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, normalizeUrl } from '../src/config.js';
import { InvenTreeClient, InvenTreeError } from '../src/inventree/client.js';
import { HOST, TOKEN, createInvenTree, fixture } from './helpers/fakeInvenTree.js';

const answering =
  (status, body, type = 'application/json') =>
  async () =>
    new Response(body, { status, headers: { 'content-type': type } });

async function kindOf(fetch) {
  const client = new InvenTreeClient({ url: HOST, token: TOKEN, fetch, timeout: 100 });
  const err = await client.parts().then(
    () => null,
    (error) => error,
  );
  assert.ok(err instanceof InvenTreeError, String(err));
  return err.kind;
}

test('normalizeUrl: scheme, port, path, pasted suffix, refused shapes', () => {
  assert.equal(normalizeUrl('192.0.2.40:8000'), 'http://192.0.2.40:8000');
  assert.equal(
    normalizeUrl(' https://example.org/inventree/api/ '),
    'https://example.org/inventree',
  );
  assert.equal(normalizeUrl('https://example.org/web/'), 'https://example.org');
  for (const bad of ['', 'ftp://192.0.2.40', 'http://user:pw@192.0.2.40', 'http://x/?a=1', 42]) {
    assert.equal(normalizeUrl(bad), null, String(bad));
  }
});

test('normalizeConfig: defaults, a pasted "Token" and line breaks', () => {
  const config = normalizeConfig({
    url: 'inventree.local:8000',
    api_token: ' Token inv-abc\ndef ',
    refresh_minutes: '7',
    part_devices: 'all',
    allow_stock_removal: 'true',
    language: 'it',
  });
  assert.deepEqual(config, {
    url: 'http://inventree.local:8000',
    urlInvalid: false,
    apiToken: 'inv-abcdef',
    refreshMinutes: 15,
    partDevices: 'starred',
    allowStockRemoval: true,
    language: 'fr',
  });
  assert.equal(normalizeConfig({}).allowStockRemoval, false);
  assert.equal(normalizeConfig({ url: 'ftp://x' }).urlInvalid, true);
  assert.equal(normalizeConfig(null).url, null);
});

test('the client sends the token, asks for JSON, and pages', async () => {
  const server = createInvenTree();
  server.state.pageSize = 4;
  const client = new InvenTreeClient({ url: HOST, token: TOKEN, fetch: server.fetch });
  assert.equal((await client.parts()).length, 7);
  assert.equal((await client.info()).version, '1.6.1');
  assert.deepEqual(server.state.requests.slice(0, 2), [
    'GET /part/?active=true&limit=500&offset=0',
    'GET /part/?active=true&limit=500&offset=4',
  ]);
});

test('errors: refused token, missing role, redirect, HTML, 404, 500, not a list', async () => {
  assert.equal(await kindOf(answering(401, fixture('unauthorized.json'))), 'unauthorized');
  assert.equal(await kindOf(answering(403, fixture('forbidden.json'))), 'forbidden');
  assert.equal(await kindOf(answering(302, '', 'text/html')), 'invalid');
  assert.equal(await kindOf(answering(200, '<html>Login</html>', 'text/html')), 'invalid');
  assert.equal(await kindOf(answering(404, fixture('not-found.json'))), 'not_found');
  assert.equal(await kindOf(answering(500, '{"detail":"boom"}')), 'http');
  // A bare array: InvenTree answers that when `limit` is missing (a proxy dropping it).
  assert.equal(await kindOf(answering(200, '[]')), 'invalid');
  assert.equal(
    await kindOf(async () => {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }),
    'unreachable',
  );
  assert.equal(
    await kindOf(
      (url, init) =>
        new Promise((resolve, reject) => {
          // A pending timer keeps Node 22 alive: AbortSignal.timeout does not.
          const late = setTimeout(resolve, 5_000);
          init.signal.addEventListener('abort', () => {
            clearTimeout(late);
            reject(init.signal.reason);
          });
        }),
    ),
    'timeout',
  );
});

test('a 400 tells the first field error', async () => {
  const client = new InvenTreeClient({
    url: HOST,
    token: TOKEN,
    fetch: answering(400, '{"items":["Quantity must be greater than zero"]}'),
  });
  const err = await client.removeStock([{ pk: 1, quantity: '0' }], 'x').catch((e) => e);
  assert.equal(err.message, '/stock/remove/: HTTP 400: Quantity must be greater than zero');
});

test('a server answering a wrong count does not loop forever', async () => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ count: 1e9, results: [{ pk: calls }] }), { status: 200 });
  };
  const client = new InvenTreeClient({ url: HOST, token: TOKEN, fetch });
  const err = await client.parts().catch((error) => error);
  assert.equal(err.kind, 'invalid');
  assert.equal(calls, 200);
});

test('no error message carries the token', async () => {
  const client = new InvenTreeClient({ url: HOST, token: 'abc\u0000SECRET' });
  const err = await client.parts().catch((error) => error);
  assert.equal(err.kind, 'unreachable');
  assert.ok(!err.message.includes('SECRET'), err.message);
  for (const fetch of [answering(401, fixture('unauthorized.json')), answering(500, '{}')]) {
    const failing = new InvenTreeClient({ url: HOST, token: TOKEN, fetch });
    const error = await failing.parts().catch((e) => e);
    assert.ok(!error.message.includes(TOKEN));
  }
});
