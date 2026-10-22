// -----------------------------------------------------------------------------
// InvenTree -> Gladys devices:
// - one "InvenTree stock" device (`inventree:stock`): parts, parts below
//   minimum, out of stock, purchase orders in progress and overdue, value;
// - optionally one device per followed part (`part:<pk>`): quantity in
//   stock, minimum, quantity on order.
//
// InvenTree has no instance id a token can read: the stock device id is
// fixed, so a new address (a new IP, a reverse proxy) keeps the same device.
// A part is keyed on its primary key, stable for the life of the part.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPE,
} from '@gladysassistant/integration-sdk';
import { NAMES } from './texts.js';

export const STOCK_TYPE = 'inventree';
export const STOCK_ID = 'stock';
export const PART_TYPE = 'part';

// Past that many followed parts, the rest gets no device (logged once).
export const MAX_PART_DEVICES = 50;

const MAX_COUNT = 1_000_000_000;
const MAX_VALUE = 1_000_000_000;

// InvenTree currency -> Gladys unit, for the few Gladys knows.
const CURRENCY_UNITS = { EUR: 'euro', USD: 'dollar', GBP: 'pound-sterling' };

export const stockIds = (gladys) => gladys.externalIds(STOCK_TYPE, STOCK_ID);
export const partIds = (gladys, id) => gladys.externalIds(PART_TYPE, String(id));

// Feature key -> [summary -> count, or null when the token may not read it].
export const COUNTS = {
  parts: (s) => s.parts,
  low_stock: (s) => s.low.length,
  out_of_stock: (s) => s.out.length,
  purchase_orders: (s) => s.orders?.length ?? null,
  overdue_orders: (s) => s.overdue ?? null,
};

function feature(ids, key, name, fields) {
  return {
    name,
    external_id: ids.feature(key),
    read_only: true,
    has_feedback: false,
    ...fields,
  };
}

const counter = (history = true) => ({
  category: CAT.COUNTER_SENSOR,
  type: TYPE.SENSOR.INTEGER,
  min: 0,
  max: MAX_COUNT,
  keep_history: history,
});

/**
 * @param {object} gladys
 * @param {string} language
 * @param {{ url: string, version: string | null, currency: string | null }} info
 */
export function buildStockDevice(gladys, language, { url, version, currency }) {
  const names = NAMES[language] ?? NAMES.en;
  const ids = stockIds(gladys);
  const unit = CURRENCY_UNITS[currency];
  return {
    name: 'InvenTree',
    external_id: ids.device,
    model: version ? `InvenTree ${version}`.slice(0, 60) : 'InvenTree',
    should_poll: false,
    features: [
      ...Object.keys(COUNTS).map((key) => feature(ids, key, names[key], counter())),
      feature(ids, 'stock_value', names.stock_value, {
        category: CAT.CURRENCY,
        type: TYPE.CURRENCY?.DECIMAL ?? 'decimal',
        ...(unit ? { unit } : {}),
        min: 0,
        max: MAX_VALUE,
        keep_history: true,
      }),
    ],
    params: [{ name: 'INVENTREE_URL', value: url }],
  };
}

export function buildStockStates(gladys, summary) {
  const ids = stockIds(gladys);
  const states = [];
  for (const [key, count] of Object.entries(COUNTS)) {
    const value = count(summary);
    if (value !== null) {
      states.push({ device_feature_external_id: ids.feature(key), state: value });
    }
  }
  if (summary.value) {
    states.push({
      device_feature_external_id: ids.feature('stock_value'),
      state: summary.value.value,
    });
  }
  return states;
}

/** @param {{ id: number, name: string, ipn: string, category: string }} part */
export function buildPartDevice(gladys, part, language, url) {
  const names = NAMES[language] ?? NAMES.en;
  const ids = partIds(gladys, part.id);
  return {
    name: part.name.slice(0, 60),
    external_id: ids.device,
    model: (part.ipn ? `${part.ipn} · ${part.category}` : part.category || 'InvenTree').slice(
      0,
      60,
    ),
    should_poll: false,
    features: [
      feature(ids, 'quantity', names.quantity, counter()),
      feature(ids, 'minimum', names.minimum, counter(false)),
      feature(ids, 'on_order', names.on_order, counter(false)),
    ],
    params: [
      { name: 'INVENTREE_PART', value: String(part.id) },
      { name: 'INVENTREE_URL', value: `${url}/web/part/${part.id}` },
    ],
  };
}

export function buildPartStates(gladys, part) {
  const ids = partIds(gladys, part.id);
  return [
    { device_feature_external_id: ids.feature('quantity'), state: part.stock },
    { device_feature_external_id: ids.feature('minimum'), state: part.minimum },
    { device_feature_external_id: ids.feature('on_order'), state: part.ordering },
  ];
}

/** The parts that get a device, by the `part_devices` setting. */
export function followedParts(parts, mode) {
  if (mode === 'starred') {
    return parts.filter((part) => part.starred && !part.virtual);
  }
  if (mode === 'minimum') {
    return parts.filter((part) => part.minimum > 0 && !part.virtual);
  }
  return [];
}

/** The part id of a part device external id, or null. */
export function partIdOf(gladys, externalId) {
  const prefix = partIds(gladys, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const id = Number(externalId.slice(prefix.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}
