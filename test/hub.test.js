// The integration end to end: the SDK's fake Gladys, the wiring of
// src/app.js and the fake InvenTree built on real answers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { MemoryStore } from '../src/store.js';
import { TRIGGERS, WIDGET_KEY } from '../src/hub.js';
import {
  HOST,
  LIMITED_TOKEN,
  NOW,
  TOKEN,
  VIEWER_TOKEN,
  createInvenTree,
  settle,
} from './helpers/fakeInvenTree.js';
import { PART, STOCK, createAll, createWorld, stockFeature } from './helpers/world.js';

const partFeature = (id, key) => `${PART(id)}:${key}`;

test('the stock device and one device per starred part, states once added', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => [d.external_id, d.name]),
    [
      [STOCK, 'InvenTree'],
      [PART(3), 'Arduino Nano'],
      [PART(2), 'PLA black 1kg'],
    ],
  );
  assert.equal(devices[0].model, 'InvenTree 1.6.1');
  assert.ok(devices.every((d) => d.should_poll === false));
  const value = devices[0].features.find((f) => f.external_id === stockFeature('stock_value'));
  assert.deepEqual([value.category, value.type, value.unit], ['currency', 'decimal', 'euro']);
  assert.equal(world.fake.states.length, 0, 'nothing before the devices are added');
  assert.equal(world.fake.connectionStatus.connected, true);

  await createAll(world.fake);
  const last = (key) => world.fake.lastState(stockFeature(key));
  assert.equal(last('parts'), 7, 'the inactive part is not listed');
  assert.equal(last('low_stock'), 3, 'AA batteries 4/8, Arduino 2/3, PETG 0/1');
  assert.equal(last('out_of_stock'), 1, 'PETG; the M3 screws have no minimum');
  assert.equal(last('purchase_orders'), 2);
  assert.equal(last('overdue_orders'), 1);
  assert.equal(last('stock_value'), 75.5, 'EUR items; the glue sticks have no price');
  assert.deepEqual(
    ['quantity', 'minimum', 'on_order'].map((key) => world.fake.lastState(partFeature(3, key))),
    [2, 3, 5],
  );
  assert.ok(world.fake.widgetRefreshes.includes(WIDGET_KEY));
});

test('part devices: none, or every part with a minimum; names follow the language', async (t) => {
  const none = await createWorld({ config: { url: HOST, api_token: TOKEN, part_devices: 'none' } });
  t.after(() => none.app.stop());
  assert.equal(none.fake.discoveredDevices.length, 1);

  const world = await createWorld({
    config: { url: HOST, api_token: TOKEN, part_devices: 'minimum', language: 'en' },
  });
  t.after(() => world.app.stop());
  assert.deepEqual(
    world.fake.discoveredDevices.slice(1).map((d) => d.name),
    ['AA batteries', 'Arduino Nano', 'PETG white 1kg', 'PLA black 1kg', 'Resistor 10k'],
  );
  assert.deepEqual(
    world.fake.discoveredDevices[0].features.map((f) => f.name),
    [
      'Parts',
      'Parts below minimum',
      'Parts out of stock',
      'Purchase orders in progress',
      'Overdue purchase orders',
      'Stock value',
    ],
  );
  assert.deepEqual(
    world.fake.discoveredDevices[1].features.map((f) => f.name),
    ['Quantity in stock', 'Minimum stock', 'Quantity on order'],
  );
});

test('a pasted "Token" prefix and /api suffix are accepted; a new address keeps the device', async (t) => {
  const world = await createWorld({ config: { url: HOST, api_token: 'wrong' } });
  t.after(() => world.app.stop());
  assert.equal(world.fake.connectionStatus.connected, false);
  await world.fake.configUpdated({ url: `${HOST}/api/`, api_token: `Token ${TOKEN}` });
  await settle(20);
  assert.equal(world.fake.discoveredDevices[0].external_id, STOCK);
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('triggers: a silent baseline, then below minimum and out of stock once', async (t) => {
  const store = new MemoryStore();
  const world = await createWorld({ store });
  t.after(() => world.app.stop());
  assert.equal(world.fake.sceneEvents.length, 0, 'what is pending at install is not announced');
  assert.deepEqual(store.data.low, ['3', '5', '6']);

  // The PLA falls to 1 (minimum 2), then to 0.
  world.server.setStock(2, 1);
  await world.hub.refresh();
  assert.deepEqual(
    world.fake.sceneEvents.map((e) => [e.key, e.data]),
    [
      [
        TRIGGERS.low,
        {
          part: 'PLA black 1kg',
          ipn: '',
          category: 'Filament',
          quantity: 1,
          minimum: 2,
          on_order: 0,
        },
      ],
    ],
  );
  await world.hub.refresh();
  assert.equal(world.fake.sceneEvents.length, 1, 'once');
  world.server.setStock(2, 0);
  await world.hub.refresh();
  assert.deepEqual(world.fake.sceneEvents[1], {
    key: TRIGGERS.out,
    data: { part: 'PLA black 1kg', ipn: '', category: 'Filament', minimum: 2, on_order: 0 },
  });

  // Restocked to its minimum, then low again: announced again.
  world.server.setStock(2, 2);
  await world.hub.refresh();
  world.server.setStock(2, 1);
  await world.hub.refresh();
  assert.deepEqual(
    world.fake.sceneEvents.slice(2).map((e) => [e.key, e.data.quantity]),
    [[TRIGGERS.low, 1]],
  );
});

test('a purchase order completed in InvenTree fires "order received"; a cancelled one does not', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.server.order(2).status = 30;
  world.server.order(3).status = 40;
  await world.hub.refresh();
  assert.deepEqual(
    world.fake.sceneEvents.map((e) => [e.key, e.data]),
    [
      [
        TRIGGERS.received,
        {
          order: 'PO-0002',
          supplier: 'Example Electronics',
          description: 'Arduino and PETG',
          lines: 2,
        },
      ],
    ],
  );
  await world.hub.refresh();
  assert.equal(world.fake.sceneEvents.length, 1, 'once');
  assert.deepEqual(world.store.data.orders, []);
});

test('an order Gladys could not take is fired again on the next read', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.server.order(2).status = 30;
  const publish = world.gladys.publishSceneEvent.bind(world.gladys);
  world.gladys.publishSceneEvent = async () => {
    throw new Error('disconnected');
  };
  await world.hub.refresh();
  assert.deepEqual(world.store.data.orders, ['2', '3']);
  world.gladys.publishSceneEvent = publish;
  await world.hub.refresh();
  assert.deepEqual(
    world.fake.sceneEvents.map((e) => e.key),
    [TRIGGERS.received],
  );
});

test('each kind has its own cap per read: a mass change does not flood the scenes', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const template = world.server.part(1);
  for (let pk = 100; pk < 115; pk += 1) {
    world.server.state.parts.push({ ...template, pk, name: `Bulk ${pk}`, full_name: `Bulk ${pk}` });
  }
  await world.hub.refresh(); // new parts, well stocked: nothing
  for (let pk = 100; pk < 115; pk += 1) {
    world.server.setStock(pk, 1);
  }
  world.server.setStock(2, 0);
  await world.hub.refresh();
  const keys = world.fake.sceneEvents.map((e) => e.key);
  assert.equal(keys.filter((key) => key === TRIGGERS.low).length, 10);
  assert.equal(keys.filter((key) => key === TRIGGERS.out).length, 1);
});

test('a restart does not announce again; another InvenTree is a new baseline', async (t) => {
  const store = new MemoryStore();
  const server = createInvenTree();
  const first = await createWorld({ store, server });
  await first.app.stop();
  server.setStock(1, 50); // the resistors fall below 100 meanwhile
  const again = await createWorld({ store, server });
  t.after(() => again.app.stop());
  assert.deepEqual(
    again.fake.sceneEvents.map((e) => e.data.part),
    ['Resistor 10k'],
  );
  const other = await createWorld({
    store,
    config: { url: 'http://192.0.2.41:8000', api_token: TOKEN },
  });
  t.after(() => other.app.stop());
  assert.equal(other.fake.sceneEvents.length, 0);
});

test('a token with the "Parts" role only: orders and value stay empty', async (t) => {
  const world = await createWorld({ config: { url: HOST, api_token: LIMITED_TOKEN } });
  t.after(() => world.app.stop());
  assert.equal(world.fake.connectionStatus.connected, true);
  await createAll(world.fake);
  assert.equal(world.fake.lastState(stockFeature('low_stock')), 3);
  for (const key of ['purchase_orders', 'overdue_orders', 'stock_value']) {
    assert.equal(world.fake.lastState(stockFeature(key)), undefined, key);
  }
  const { content } = (await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' }))
    .data;
  assert.deepEqual(
    content.components.filter((c) => c.type === 'value').map((c) => c.label),
    ['Below minimum', 'Out of stock'],
    'no order tile without the orders',
  );
  const ack = await world.fake.action('test_connection', {});
  assert.match(JSON.stringify(ack.data), /answers: 7 part\(s\), 3 below minimum\./);
});

test('connection status: address, token, refused token, no role, not InvenTree, down', async (t) => {
  const cases = [
    [{}, /Enter the address/],
    [{ url: 'ftp://192.0.2.40' }, /not valid/],
    [{ url: HOST }, /API token/],
    [{ url: HOST, api_token: 'wrong' }, /Token refused/],
    [{ url: HOST, api_token: VIEWER_TOKEN }, /may not view the parts/],
  ];
  for (const [config, message] of cases) {
    const world = await createWorld({ config });
    t.after(() => world.app.stop());
    assert.equal(world.fake.connectionStatus.connected, false);
    assert.match(world.fake.connectionStatus.message.en, message);
  }
  const html = createInvenTree();
  html.state.html = true;
  const proxy = await createWorld({ server: html });
  t.after(() => proxy.app.stop());
  assert.match(proxy.fake.connectionStatus.message.en, /does not answer like InvenTree/);
  const other = createInvenTree();
  other.state.root = '{"server":"Something else"}';
  const wrong = await createWorld({ server: other });
  t.after(() => wrong.app.stop());
  assert.match(wrong.fake.connectionStatus.message.en, /does not answer like InvenTree/);

  const world = await createWorld();
  t.after(() => world.app.stop());
  world.server.goDown();
  await world.hub.refresh();
  assert.match(world.fake.connectionStatus.message.fr, /ne répond pas/);
  world.server.goUp();
  await world.hub.refresh();
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('lists are read page after page', async (t) => {
  const server = createInvenTree();
  server.state.pageSize = 3;
  const world = await createWorld({ server });
  t.after(() => world.app.stop());
  await createAll(world.fake);
  assert.equal(world.fake.lastState(stockFeature('parts')), 7);
  const pages = server.state.requests.filter((r) => r.startsWith('GET /part/?'));
  assert.deepEqual(
    pages.map((r) => new URLSearchParams(r.split('?')[1]).get('offset')),
    ['0', '3', '6'],
  );
});

test('the widget: tiles and the parts to restock, the emptiest first', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (const language of ['en', 'fr', 'de', 'es']) {
    const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language });
    assert.equal(ack.success, true, ack.error);
    assert.deepEqual(validateWidgetContent(ack.data.content), [], language);
  }
  const { content } = (await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'fr' }))
    .data;
  assert.deepEqual(
    content.components.slice(0, 3).map((c) => [c.label, c.value, c.color]),
    [
      ['Sous le seuil', 3, 'warning'],
      ['En rupture', 1, 'danger'],
      ['Commandes', 2, 'warning'],
    ],
  );
  assert.deepEqual(
    content.components[3].items.map((item) => [item.badge.text, item.title, item.subtitle]),
    [
      ['Rupture', 'PETG white 1kg', '0 / min. 1 · 2 en commande'],
      ['Bas', 'AA batteries', '4 / min. 8 · 8 en commande'],
      ['Bas', 'Arduino Nano', '2 / min. 3 · 5 en commande'],
    ],
  );
  for (const pk of [3, 5, 6]) {
    world.server.setStock(pk, 50);
  }
  await world.hub.refresh();
  const calm = (await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' })).data
    .content;
  assert.equal(calm.components.at(-1).text, 'Nothing to restock.');
});

test('the widget before the first read asks to check the configuration', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'de' });
  assert.match(ack.data.content.components[0].text, /Warte auf InvenTree/);
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
});

test('read the stock of a part: by name, IPN, number, piece of name', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const read = async (part) => world.fake.sceneAction('read_part_stock', { part });
  const ack = await read('arduino nano');
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    quantity: 2,
    minimum: 3,
    on_order: 5,
    low: true,
    text: 'Arduino Nano : 2 en stock, minimum 3, 5 en commande.',
  });
  assert.equal((await read('R-10K')).data.outputs.quantity, 250);
  assert.equal((await read('#4')).data.outputs.quantity, 12);
  assert.equal((await read('4')).data.outputs.quantity, 12);
  assert.equal((await read('glue')).data.outputs.quantity, 12);
  assert.match((await read('1kg')).error, /Plusieurs articles/);
  assert.match((await read('Old relay')).error, /Aucun article actif/);
  assert.match((await read('#99')).error, /Aucun article actif/);
  world.server.goDown();
  assert.match((await read('Arduino')).error, /n'a pas pu être lu/);
});

test('remove stock: disabled by default, then oldest items first, never more than there is', async (t) => {
  const off = await createWorld();
  t.after(() => off.app.stop());
  const refused = await off.fake.sceneAction('remove_stock', { part: 'AA batteries', quantity: 1 });
  assert.equal(refused.success, false);
  assert.match(refused.error, /désactivée/);
  assert.ok(!off.server.state.requests.some((r) => r.startsWith('POST')));

  const world = await createWorld({
    config: { url: HOST, api_token: TOKEN, allow_stock_removal: true, language: 'en' },
  });
  t.after(() => world.app.stop());
  // A second batch of batteries, newer.
  world.server.state.stock.push({ ...world.server.state.stock[0], pk: 50, quantity: 10 });
  world.server.setStock(5, 14);
  await world.hub.refresh();

  const ack = await world.fake.sceneAction('remove_stock', { part: 'AA batteries', quantity: 6 });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(
    world.server.state.stock.filter((row) => row.part === 5).map((row) => [row.pk, row.quantity]),
    [[50, 8]],
    'the older item emptied first, then the newer one',
  );
  assert.deepEqual([ack.data.outputs.quantity, ack.data.outputs.low], [8, false]);

  const short = await world.fake.sceneAction('remove_stock', { part: 'AA batteries', quantity: 9 });
  assert.match(short.error, /Not enough stock/);
  assert.equal(world.server.part(5).total_in_stock, 8, 'nothing removed');

  world.server.state.removeStatus = 403;
  const forbidden = await world.fake.sceneAction('remove_stock', {
    part: 'AA batteries',
    quantity: 1,
  });
  assert.match(forbidden.error, /may not change the stock/);
  const zero = await world.fake.sceneAction('remove_stock', { part: 'AA batteries', quantity: 0 });
  assert.match(zero.error, /above zero/);
});

test('a removal below the minimum fires the trigger at once', async (t) => {
  const world = await createWorld({
    config: { url: HOST, api_token: TOKEN, allow_stock_removal: true },
  });
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('remove_stock', { part: 'PLA black 1kg', quantity: 2 });
  assert.equal(ack.success, true, ack.error);
  await settle(20);
  assert.deepEqual(
    world.fake.sceneEvents.map((e) => [e.key, e.data.part, e.data.quantity]),
    [[TRIGGERS.low, 'PLA black 1kg', 1]],
  );
});

test('test_connection reports the version and the counts', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.action('test_connection', {});
  assert.equal(ack.success, true, ack.error);
  assert.match(
    JSON.stringify(ack.data),
    /InvenTree 1\.6\.1 answers: 7 part\(s\), 3 below minimum, 2 purchase order\(s\) in progress\./,
  );
});

test('onPoll and onDeviceCreated publish the states again', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world.fake);
  const before = world.fake.states.length;
  await world.fake.poll(world.fake.discoveredDevices[1]);
  await settle();
  await world.fake.deviceCreated(world.fake.discoveredDevices[0]);
  await settle();
  assert.ok(world.fake.states.length >= before + 6, 'everything again after a creation');
});

test('the container reads InvenTree on its own timer', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const world = await createWorld();
  t.after(() => world.app.stop());
  const reads = () => world.server.state.requests.filter((r) => r.startsWith('GET /part/?'));
  assert.equal(reads().length, 1);
  t.mock.timers.tick(15 * 60_000);
  await settle(20);
  assert.equal(reads().length, 2, 'one more read after 15 minutes, without onPoll');
});

test('the clock of the tests is the day of the fixtures', () => {
  assert.equal(new Date(NOW).getDate(), 22);
});

test('two removals at once cannot both pass the stock check', async (t) => {
  const world = await createWorld({
    config: { url: HOST, api_token: TOKEN, allow_stock_removal: true, language: 'en' },
  });
  t.after(() => world.app.stop());
  const [first, second] = await Promise.all([
    world.fake.sceneAction('remove_stock', { part: 'AA batteries', quantity: 3 }),
    world.fake.sceneAction('remove_stock', { part: 'AA batteries', quantity: 3 }),
  ]);
  assert.equal(first.success, true, first.error);
  assert.match(second.error, /Not enough stock/);
  assert.equal(world.server.part(5).total_in_stock, 1);
});

test('a plain number is never a piece of a name; decimals are rounded as InvenTree does', async (t) => {
  const world = await createWorld({
    config: { url: HOST, api_token: TOKEN, allow_stock_removal: true, language: 'en' },
  });
  t.after(() => world.app.stop());
  world.server.part(1).name = 'Battery 12V';
  await world.hub.refresh();
  const ack = await world.fake.sceneAction('remove_stock', { part: '12', quantity: 1 });
  assert.match(ack.error, /No active part/);
  assert.ok(!world.server.state.requests.some((r) => r.startsWith('POST')));
  world.server.state.stock.find((row) => row.part === 5).quantity = 0.1;
  world.server.state.stock.push({ ...world.server.state.stock[0], pk: 51, part: 5, quantity: 4 });
  const posted = [];
  const fetch = world.server.fetch;
  world.hub.client.fetch = async (url, init) => {
    if (init.method === 'POST') posted.push(JSON.parse(init.body).items);
    return fetch(url, init);
  };
  const small = await world.fake.sceneAction('remove_stock', { part: '#5', quantity: 0.1000001 });
  assert.equal(small.success, true, small.error);
  assert.deepEqual(posted, [[{ pk: 5, quantity: '0.1' }]]);
});

test('a stop while announcing saves what was fired; the rest fires at the next start', async (t) => {
  const store = new MemoryStore();
  const server = createInvenTree();
  const world = await createWorld({ store, server });
  server.setStock(2, 1);
  server.setStock(1, 50);
  const publish = world.gladys.publishSceneEvent.bind(world.gladys);
  world.gladys.publishSceneEvent = async (...args) => {
    await publish(...args);
    world.hub.stopped = true;
  };
  await world.hub.refresh();
  await world.app.stop();
  assert.equal(world.fake.sceneEvents.length, 1);
  const again = await createWorld({ store, server });
  t.after(() => again.app.stop());
  assert.deepEqual(
    again.fake.sceneEvents.map((e) => e.data.part),
    world.fake.sceneEvents[0].data.part === 'PLA black 1kg' ? ['Resistor 10k'] : ['PLA black 1kg'],
  );
});
