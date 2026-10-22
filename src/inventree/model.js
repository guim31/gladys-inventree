// -----------------------------------------------------------------------------
// InvenTree rows -> the few facts Gladys needs, then the summary of the stock:
// parts below their minimum, parts out of stock, purchase orders on the way,
// value of the stock.
//
// "Low stock" is InvenTree's own rule (its `low_stock` filter): a minimum
// stock above zero and a total stock (variants included) strictly below it.
// "Out of stock": a part with a minimum and nothing left. Parts without a
// minimum are often catalog entries never stocked: they are not counted.
// -----------------------------------------------------------------------------

/** A decimal of the API (number, or string such as "8.000000") -> number or null. */
export function number(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** 2.0 -> 2, 0.30000000000000004 -> 0.3 (quantities can be decimal: 0.5 kg). */
export const round = (value, digits = 3) => Number(value.toFixed(digits));

const text = (value) => (typeof value === 'string' ? value.trim() : '');

export function parsePart(row) {
  // Not `full_name`: it is prefixed with the IPN ("R-10K | Resistor 10k").
  const base = text(row.name) || `#${row.pk}`;
  const name = text(row.revision) ? `${base} (${text(row.revision)})` : base;
  return {
    id: row.pk,
    name,
    ipn: text(row.IPN),
    category: text(row.category_name),
    units: text(row.units),
    stock: round(number(row.total_in_stock) ?? number(row.in_stock) ?? 0),
    minimum: round(number(row.minimum_stock) ?? 0),
    ordering: round(number(row.ordering) ?? 0),
    starred: row.starred === true,
    virtual: row.virtual === true,
  };
}

export const isLow = (part) => part.minimum > 0 && part.stock < part.minimum;
export const isOut = (part) => part.minimum > 0 && part.stock <= 0;

/** A purchase order. `overdue` is computed by InvenTree (target date passed). */
export function parseOrder(row) {
  const target = typeof row.target_date === 'string' ? row.target_date.slice(0, 10) : null;
  return {
    id: row.pk,
    reference: text(row.reference) || `#${row.pk}`,
    supplier: text(row.supplier_name) || text(row.supplier_detail?.name),
    description: text(row.description),
    target,
    overdue: row.overdue === true,
    status: number(row.status),
    lines: number(row.line_items) ?? 0,
  };
}

// PurchaseOrderStatus of InvenTree.
export const ORDER_COMPLETE = 30;

/**
 * The value of the stock items in the main currency of InvenTree: quantity x
 * purchase price, converted with InvenTree's exchange rates. An item without
 * a price counts for nothing; an item in a currency without a rate is left
 * out (counted in `unconverted`).
 * @param {object[]} items rows of /api/stock/
 * @param {{ base_currency?: string, exchange_rates?: Record<string, number> }} exchange
 */
export function stockValue(items, exchange) {
  const base = text(exchange?.base_currency).toUpperCase() || null;
  const rates = exchange?.exchange_rates ?? {};
  let value = 0;
  let unconverted = 0;
  for (const item of items) {
    const price = number(item.purchase_price);
    const quantity = number(item.quantity);
    if (price === null || quantity === null) {
      continue;
    }
    const currency = text(item.purchase_price_currency).toUpperCase() || base;
    if (currency === base) {
      value += price * quantity;
      continue;
    }
    // Rates are "1 base = rate x currency".
    const rate = number(rates[currency]);
    if (rate && rate > 0) {
      value += (price * quantity) / rate;
    } else {
      unconverted += 1;
    }
  }
  return { value: Math.round(value * 100) / 100, currency: base, unconverted };
}

const byUrgency = (a, b) =>
  a.stock / a.minimum - b.stock / b.minimum || a.name.localeCompare(b.name) || a.id - b.id;

/**
 * @param {{ parts: object[], orders: object[] | null, value: object | null }} data
 *   parsed parts and orders (null when the token may not read the orders),
 *   stock value (null when the token may not read the stock)
 */
export function summarize({ parts, orders, value }) {
  const stocked = parts.filter((part) => !part.virtual);
  const low = stocked.filter(isLow).sort(byUrgency);
  return {
    parts: stocked.length,
    low,
    out: low.filter(isOut),
    orders,
    overdue: orders && orders.filter((order) => order.overdue).length,
    value,
  };
}
