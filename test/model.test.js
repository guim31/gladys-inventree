// The model: InvenTree rows -> facts, the summary, the value of the stock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLow,
  isOut,
  number,
  parseOrder,
  parsePart,
  stockValue,
  summarize,
} from '../src/inventree/model.js';
import { fixture } from './helpers/fakeInvenTree.js';

const rows = (name) => JSON.parse(fixture(name)).results;

test('numbers: floats and the decimal strings of the API', () => {
  assert.equal(number('8.000000'), 8);
  assert.equal(number(2.5), 2.5);
  assert.equal(number(''), null);
  assert.equal(number(null), null);
});

test('parts: name without the IPN prefix, revision, totals', () => {
  const parts = rows('parts.json').map(parsePart);
  const resistor = parts.find((part) => part.ipn === 'R-10K');
  assert.deepEqual(
    [resistor.name, resistor.category, resistor.stock, resistor.minimum],
    ['Resistor 10k', 'Electronics', 250, 100],
  );
  assert.equal(parsePart({ pk: 9, name: 'Board', revision: 'B' }).name, 'Board (B)');
});

test('low stock is strictly below a minimum above zero, as in InvenTree', () => {
  assert.equal(isLow({ stock: 2, minimum: 2 }), false);
  assert.equal(isLow({ stock: 1.5, minimum: 2 }), true);
  assert.equal(isLow({ stock: 0, minimum: 0 }), false);
  assert.equal(isOut({ stock: 0, minimum: 1 }), true);
  assert.equal(isOut({ stock: 0, minimum: 0 }), false, 'no minimum: not followed');
});

test('orders: reference, supplier, overdue as InvenTree computes it', () => {
  const orders = rows('po-outstanding.json').map(parseOrder);
  assert.deepEqual(
    orders.map((order) => [order.reference, order.supplier, order.overdue, order.lines]),
    [
      ['PO-0003', 'Example Electronics', false, 1],
      ['PO-0002', 'Example Electronics', true, 2],
    ],
  );
});

test('stock value: converted with the rates, items without price or rate left out', () => {
  const exchange = JSON.parse(fixture('exchange.json'));
  assert.deepEqual(stockValue(rows('stock.json'), exchange), {
    value: 75.5,
    currency: 'EUR',
    unconverted: 0,
  });
  const items = [
    { quantity: 2, purchase_price: 11.234, purchase_price_currency: 'USD' },
    { quantity: 1, purchase_price: 5, purchase_price_currency: 'XYZ' },
  ];
  assert.deepEqual(stockValue(items, exchange), { value: 20, currency: 'EUR', unconverted: 1 });
});

test('the summary: virtual parts are not counted, the emptiest first', () => {
  const parts = [
    { id: 1, name: 'A', stock: 1, minimum: 4, virtual: false },
    { id: 2, name: 'B', stock: 0, minimum: 1, virtual: false },
    { id: 3, name: 'C', stock: 0, minimum: 1, virtual: true },
  ];
  const summary = summarize({ parts, orders: null, value: null });
  assert.equal(summary.parts, 2);
  assert.deepEqual(
    summary.low.map((part) => part.id),
    [2, 1],
  );
  assert.equal(summary.out.length, 1);
  assert.equal(summary.overdue, null);
});
