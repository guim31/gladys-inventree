// -----------------------------------------------------------------------------
// The hub: the link to one InvenTree and everything Gladys sees of it — the
// devices, their states, the connection status, scene events and actions.
//
// InvenTree pushes nothing: the stock is read every `refresh_minutes` (15 by
// default) by a timer of the container (should_poll: false, the interval
// being beyond the core's 60 s list). A read is the active parts, and if the
// token may read them, the purchase orders in progress and the stock items
// (for the value), 500 rows per request.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  MAX_PART_DEVICES,
  buildPartDevice,
  buildPartStates,
  buildStockDevice,
  buildStockStates,
  followedParts,
  partIdOf,
  stockIds,
} from './devices.js';
import { InvenTreeClient, InvenTreeError } from './inventree/client.js';
import {
  ORDER_COMPLETE,
  isLow,
  number,
  parseOrder,
  parsePart,
  round,
  stockValue,
  summarize,
} from './inventree/model.js';
import { MemoryStore } from './store.js';
import { STATUS_TEXT, TEST_TEXT, commandMessage, partText } from './texts.js';

const logger = createLogger({ name: 'inventree-hub' });

export const WIDGET_KEY = 'restock';
export const TRIGGERS = {
  low: 'part_low_stock',
  out: 'part_out_of_stock',
  received: 'order_received',
};

export const DEFAULT_TIMINGS = {
  // requestWidgetRefresh is dropped by the core beyond one call per 10 s.
  widgetGap: 10_500,
  // An unchanged value is sent again before Gladys calls it stale (48 h).
  heartbeat: 6 * 3_600_000,
  requestTimeout: 20_000,
};

// An import can put hundreds of parts below their minimum at once: past that
// many events of a kind in one read, the rest is recorded without firing.
export const MAX_EVENTS_PER_READ = 10;

// Written in the stock history of InvenTree with each removal.
export const REMOVAL_NOTE = 'Removed by a Gladys Assistant scene';

/** An Error carrying a coded, multi-language message. */
export class CommandError extends Error {
  constructor(code, language) {
    const messages = commandMessage(code);
    super(messages[language] ?? messages.en);
    this.code = code;
    this.messages = messages;
  }
}

const refusal = (err) =>
  err instanceof InvenTreeError && ['forbidden', 'not_found'].includes(err.kind);

export class Hub {
  constructor({ gladys, fetch, timings, now = Date.now, store }) {
    this.gladys = gladys;
    this.fetch = fetch;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.now = now;
    this.store = store ?? new MemoryStore();
    this.config = {
      url: null,
      urlInvalid: false,
      apiToken: '',
      refreshMinutes: 15,
      partDevices: 'starred',
      allowStockRemoval: false,
      language: 'fr',
    };
    this.client = null;
    this.version = null;
    /** parsed active parts of the last read */
    this.parts = null;
    /** parsed outstanding orders (null: the token may not read them) */
    this.orders = null;
    this.value = null;
    this.summary = null;
    /** null (fine), or the kind of the last failure */
    this.failure = null;
    this.announced = false;
    /** the optional lists the token may not read, already logged */
    this.refused = new Set();
    this.tooManyLogged = false;
    this.lastStatus = '';
    /** what the triggers already announced: { instance, low: [], out: [], orders: [] } */
    this.notified = null;
    this.configuring = Promise.resolve();
    this.refreshTimer = null;
    this.refreshing = null;
    this.refreshAgain = false;
    this.widgetRefreshAt = 0;
    this.widgetTimer = null;
    this.publishFailing = false;
    this.stopped = false;
  }

  get language() {
    return this.config.language;
  }

  get loaded() {
    return this.summary !== null;
  }

  async start(config) {
    const saved = await this.store.load();
    // A damaged file is a new baseline, not a crash on every read.
    this.notified = typeof saved.instance === 'string' ? saved : null;
    await this.reconfigure(config);
  }

  /** One configuration change at a time: a second one waits for the first. */
  reconfigure(config) {
    const run = this.configuring.then(() => this.#reconfigure(config));
    this.configuring = run.catch(() => {});
    return run;
  }

  async #reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const linkChanged =
      previous.url !== config.url || previous.apiToken !== config.apiToken || !this.client;
    if (linkChanged || previous.refreshMinutes !== config.refreshMinutes) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (linkChanged) {
      this.client = null;
      this.version = null;
      this.parts = null;
      this.orders = null;
      this.value = null;
      this.summary = null;
      this.failure = null;
      this.announced = false;
      this.refused.clear();
      if (config.url && config.apiToken) {
        this.client = new InvenTreeClient({
          url: config.url,
          token: config.apiToken,
          fetch: this.fetch,
          timeout: this.timings.requestTimeout,
        });
      }
    }
    if (this.client && !this.refreshTimer) {
      this.refreshTimer = setInterval(
        () => this.refresh().catch((err) => logger.error('Read failed', err)),
        config.refreshMinutes * 60_000,
      );
      this.refreshTimer.unref?.();
    }
    if (linkChanged) {
      await this.refresh();
    } else {
      // Language or followed parts only: same data, new names and devices.
      this.gladys.forgetPublishedStates?.();
      this.tooManyLogged = false;
      await this.#update();
    }
    await this.updateConnectionStatus();
  }

  /** Gladys reconnected (it may have restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.lastStatus = '';
    await this.reconfigure(config);
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.refreshTimer);
    clearTimeout(this.widgetTimer);
    this.refreshTimer = null;
    // A read under way finishes first, so what it announced is saved.
    await this.refreshing?.catch(() => {});
    await this.store.flush();
  }

  // --- Reading InvenTree ----------------------------------------------------

  /** Read the stock (one read at a time; a request during it runs once after). */
  refresh() {
    if (this.refreshing) {
      this.refreshAgain = true;
      return this.refreshing;
    }
    this.refreshing = (async () => {
      do {
        this.refreshAgain = false;
        try {
          await this.#refreshOnce();
        } catch (err) {
          // Never ends the loop: a read queued meanwhile (new address) still runs.
          logger.error('Read failed', err);
        }
      } while (this.refreshAgain && !this.stopped);
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /** `GET /api/` answers without token: the version, and proof it is InvenTree. */
  async #version(client) {
    const answer = await client.info();
    if (answer?.server !== 'InvenTree') {
      throw new InvenTreeError('invalid', '/api/: this server is not InvenTree');
    }
    return String(answer.version ?? '?').replace(/^v/, '');
  }

  /** An optional read: null when the token may not read it. */
  async #optional(name, read) {
    try {
      return await read();
    } catch (err) {
      if (!refusal(err)) {
        throw err;
      }
      if (!this.refused.has(name)) {
        this.refused.add(name);
        logger.warn(`Cannot read the ${name} (${err.message}): their features stay empty`);
      }
      return null;
    }
  }

  async #refreshOnce() {
    const client = this.client;
    if (this.stopped) {
      return;
    }
    if (!client) {
      await this.publishDevices();
      return;
    }
    let parts;
    let orders;
    let value;
    try {
      if (!this.version) {
        this.version = await this.#version(client);
      }
      const [partRows, orderRows, stockRows, exchange] = await Promise.all([
        client.parts(),
        this.#optional('purchase orders', () => client.outstandingOrders()),
        this.#optional('stock items', () => client.stock()),
        this.#optional('exchange rates', () => client.exchange()),
      ]);
      parts = partRows.map(parsePart);
      orders = orderRows && orderRows.map(parseOrder);
      value = stockRows && exchange ? stockValue(stockRows, exchange) : null;
    } catch (err) {
      if (client !== this.client) {
        return;
      }
      this.#fail(err);
      await this.updateConnectionStatus();
      return;
    }
    if (client !== this.client || this.stopped) {
      return;
    }
    this.parts = parts;
    this.orders = orders;
    this.value = value;
    this.#recover();
    await this.#update();
    if (client !== this.client || !this.summary) {
      // Reconfigured meanwhile: the read of the new link takes over.
      return;
    }
    await this.#announce(client);
    await this.updateConnectionStatus();
  }

  /** Summary, devices, states and widget from the last read. */
  async #update() {
    if (this.parts) {
      this.summary = summarize({ parts: this.parts, orders: this.orders, value: this.value });
    }
    await this.publishDevices();
    await this.publishStates();
    this.refreshWidget();
  }

  #fail(err) {
    const kind = err instanceof InvenTreeError ? err.kind : 'unreachable';
    if (this.failure === null) {
      logger.warn(`InvenTree: ${err.message}`);
    } else {
      logger.debug(`InvenTree still failing: ${err.message}`);
    }
    this.failure = kind;
    if (kind === 'invalid' || kind === 'not_found') {
      this.version = null;
    }
  }

  #recover() {
    const count = this.parts.length;
    if (this.failure !== null) {
      logger.info(`InvenTree answers again (${count} parts)`);
    } else if (!this.announced) {
      logger.info(`Connected to InvenTree ${this.version} (${count} parts)`);
    }
    this.announced = true;
    this.failure = null;
  }

  // --- Scene events ---------------------------------------------------------

  /**
   * Fire what changed since the last read: a part going below its minimum, a
   * part running out, a purchase order received. The first read of an
   * InvenTree (or of a list) is a silent baseline: installing the integration
   * announces nothing already pending. A part is announced again once it went
   * back to its minimum.
   */
  async #announce(client) {
    const summary = this.summary;
    const instance = this.config.url;
    const known = this.notified?.instance === instance ? this.notified : null;
    const current = {
      out: summary.out.map((part) => [String(part.id), () => this.#partEvent(TRIGGERS.out, part)]),
      low: summary.low.map((part) => [String(part.id), () => this.#partEvent(TRIGGERS.low, part)]),
    };
    // An event Gladys did not take (disconnected, restarting) is not
    // recorded: the next read fires it again.
    const failed = new Set();
    const fire = async (kind, key, [trigger, data]) => {
      try {
        await this.gladys.publishSceneEvent(trigger, data);
      } catch (err) {
        failed.add(`${kind}:${key}`);
        logger.warn(`Cannot fire ${trigger}: ${err.message}`);
      }
    };
    for (const [kind, entries] of Object.entries(current)) {
      const done = known?.[kind];
      if (!Array.isArray(done)) {
        continue;
      }
      const fresh = entries.filter(([key]) => !done.includes(key));
      if (fresh.length > MAX_EVENTS_PER_READ) {
        logger.info(`${fresh.length} ${kind} events at once: ${MAX_EVENTS_PER_READ} announced`);
      }
      for (const [key, event] of fresh.slice(0, MAX_EVENTS_PER_READ)) {
        if (this.stopped) {
          return;
        }
        await fire(kind, key, event());
      }
    }

    // Orders: one that left the outstanding list was received, cancelled or
    // deleted; its detail tells which.
    let orders = known?.orders ?? null;
    if (this.orders) {
      const outstanding = this.orders.map((order) => String(order.id));
      const kept = [];
      if (Array.isArray(orders)) {
        const gone = orders.filter((id) => !outstanding.includes(id));
        for (const id of gone.slice(0, MAX_EVENTS_PER_READ)) {
          if (this.stopped) {
            return;
          }
          const keep = await this.#orderGone(client, id, fire, failed);
          if (keep) {
            kept.push(id);
          }
        }
        kept.push(...gone.slice(MAX_EVENTS_PER_READ));
      }
      orders = [...new Set([...outstanding, ...kept])].sort();
    }

    const next = { instance, orders };
    for (const [kind, entries] of Object.entries(current)) {
      next[kind] = entries
        .map(([key]) => key)
        .filter((key) => !failed.has(`${kind}:${key}`))
        .sort();
    }
    if (JSON.stringify(next) !== JSON.stringify(this.notified)) {
      this.notified = next;
      await this.store.save(next);
    }
  }

  /** @returns {Promise<boolean>} true to look at this order again next time */
  async #orderGone(client, id, fire, failed) {
    let row;
    try {
      row = await client.order(id);
    } catch (err) {
      if (refusal(err)) {
        return false; // deleted
      }
      logger.debug(`Cannot read the purchase order ${id}: ${err.message}`);
      return true;
    }
    const order = parseOrder(row);
    if (order.status !== ORDER_COMPLETE) {
      logger.debug(`Purchase order ${order.reference} closed with status ${order.status}`);
      return false;
    }
    await fire('orders', id, [
      TRIGGERS.received,
      {
        order: order.reference,
        supplier: order.supplier,
        description: order.description,
        lines: order.lines,
      },
    ]);
    return failed.has(`orders:${id}`);
  }

  #partEvent(trigger, part) {
    logger.debug(`Part ${part.id} at ${part.stock} (minimum ${part.minimum}): ${trigger}`);
    const data = {
      part: part.name,
      ipn: part.ipn,
      category: part.category,
      minimum: part.minimum,
      on_order: part.ordering,
    };
    if (trigger === TRIGGERS.low) {
      data.quantity = part.stock;
    }
    return [trigger, data];
  }

  // --- Devices and states ---------------------------------------------------

  #isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  /** The parts that get a device, capped. */
  followed() {
    if (!this.parts) {
      return [];
    }
    const parts = followedParts(this.parts, this.config.partDevices);
    if (parts.length > MAX_PART_DEVICES && !this.tooManyLogged) {
      this.tooManyLogged = true;
      logger.warn(
        `${parts.length} parts to follow: only the first ${MAX_PART_DEVICES} get a device`,
      );
    }
    return parts.slice(0, MAX_PART_DEVICES);
  }

  buildDevices() {
    if (!this.summary) {
      return [];
    }
    const url = this.config.url ?? '';
    return [
      buildStockDevice(this.gladys, this.language, {
        url,
        version: this.version,
        currency: this.value?.currency ?? null,
      }),
      ...this.followed().map((part) => buildPartDevice(this.gladys, part, this.language, url)),
    ];
  }

  async publishDevices() {
    if (this.stopped) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(this.buildDevices());
    } catch (err) {
      logger.error('Cannot publish the devices', err);
    }
  }

  /**
   * The states of the devices the user added (Gladys drops the others).
   * @param {string} [created] external id of a device just created
   */
  async publishStates(created) {
    if (!this.summary || this.stopped) {
      return;
    }
    const wanted = (externalId) => externalId === created || this.#isCreated(externalId);
    const states = [];
    if (wanted(stockIds(this.gladys).device)) {
      states.push(...buildStockStates(this.gladys, this.summary));
    }
    for (const part of this.followed()) {
      if (wanted(buildPartDevice(this.gladys, part, 'en', '').external_id)) {
        states.push(...buildPartStates(this.gladys, part));
      }
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeat });
    } catch (err) {
      if (this.publishFailing) {
        logger.debug(`Cannot publish the states: ${err.message}`);
      } else {
        logger.warn(`Cannot publish the states: ${err.message}`);
      }
      this.publishFailing = true;
      return;
    }
    if (this.publishFailing) {
      logger.info('States published again');
    }
    this.publishFailing = false;
  }

  isOurDevice(externalId) {
    return (
      externalId === stockIds(this.gladys).device || partIdOf(this.gladys, externalId) !== null
    );
  }

  /** The user added a device: states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (!this.isOurDevice(device?.external_id)) {
      return;
    }
    this.gladys.forgetPublishedStates?.(device.external_id);
    await this.publishStates(device.external_id);
    this.refreshWidget();
  }

  /** onPoll (the devices are not polled: the container reads on its timer). */
  async poll(device) {
    if (this.isOurDevice(device?.external_id)) {
      await this.publishStates(device.external_id);
    }
  }

  // --- Widget ---------------------------------------------------------------

  /** Nudge the open dashboards, with a trailing call inside the core's 10 s gap. */
  refreshWidget() {
    if (this.stopped) {
      return;
    }
    const wait = this.widgetRefreshAt + this.timings.widgetGap - this.now();
    if (wait <= 0) {
      this.widgetRefreshAt = this.now();
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
      return;
    }
    if (!this.widgetTimer) {
      this.widgetTimer = setTimeout(() => {
        this.widgetTimer = null;
        this.refreshWidget();
      }, wait);
      this.widgetTimer.unref?.();
    }
  }

  // --- Connection status ----------------------------------------------------

  statusKey() {
    if (this.config.urlInvalid) {
      return 'invalid';
    }
    if (!this.config.url) {
      return 'none';
    }
    if (!this.config.apiToken) {
      return 'token';
    }
    if (this.failure) {
      return (
        {
          unauthorized: 'unauthorized',
          forbidden: 'forbidden',
          invalid: 'invalid_answer',
          not_found: 'invalid_answer',
        }[this.failure] ?? 'unreachable'
      );
    }
    return null;
  }

  statusMessage() {
    const key = this.statusKey();
    if (!key) {
      return null;
    }
    return Object.fromEntries(
      Object.entries(STATUS_TEXT).map(([language, table]) => [language, table[key]]),
    );
  }

  async updateConnectionStatus() {
    if (this.stopped) {
      return;
    }
    // Nothing to say before the first answer or failure.
    if (this.client && !this.loaded && this.failure === null) {
      return;
    }
    const message = this.statusMessage();
    const connected = Boolean(this.client) && this.loaded && this.failure === null;
    const fingerprint = JSON.stringify({ connected, message });
    if (fingerprint === this.lastStatus) {
      return;
    }
    this.lastStatus = fingerprint;
    try {
      await this.gladys.setConnectionStatus(connected, message ?? undefined);
    } catch (err) {
      logger.warn(`Cannot set the connection status: ${err.message}`);
    }
  }

  // --- Actions --------------------------------------------------------------

  /** "Test the connection": a fresh read, then its outcome. */
  async testReport() {
    if (!this.client) {
      return this.statusMessage();
    }
    await this.refresh();
    const message = this.statusMessage();
    if (message) {
      return message;
    }
    if (!this.summary) {
      return commandMessage('unreachable');
    }
    const { parts, low, orders } = this.summary;
    return Object.fromEntries(
      Object.entries(TEST_TEXT).map(([language, render]) => [
        language,
        render(this.version, parts, low.length, orders?.length ?? null),
      ]),
    );
  }

  #error(code) {
    return new CommandError(code, this.language);
  }

  /**
   * A part from what a scene author typed: `#12` (its number), its IPN, its
   * name, a plain number, or a piece of its name matching only one part.
   */
  async resolvePart(reference) {
    const raw = typeof reference === 'number' ? String(reference) : String(reference ?? '').trim();
    if (raw === '') {
      throw this.#error('part_missing');
    }
    if (!this.parts && this.client) {
      await this.refresh();
    }
    if (!this.client || !this.parts) {
      throw this.#error('unreachable');
    }
    const parts = this.parts;
    const byId = (id) => parts.find((part) => part.id === Number(id));
    const hash = raw.match(/^#(\d+)$/);
    if (hash) {
      return byId(hash[1]) ?? Promise.reject(this.#error('part_not_found'));
    }
    const lower = raw.toLocaleLowerCase();
    const one = (matches) => {
      if (matches.length > 1) {
        throw this.#error('part_ambiguous');
      }
      return matches[0];
    };
    const found =
      one(parts.filter((part) => part.ipn.toLocaleLowerCase() === lower)) ??
      one(parts.filter((part) => part.name.toLocaleLowerCase() === lower)) ??
      (/^\d+$/.test(raw) ? byId(raw) : undefined) ??
      one(parts.filter((part) => part.name.toLocaleLowerCase().includes(lower)));
    if (!found) {
      throw this.#error('part_not_found');
    }
    return found;
  }

  /** The current stock of a part, read fresh. */
  async #freshPart(part) {
    try {
      return parsePart(await this.client.part(part.id));
    } catch (err) {
      if (err instanceof InvenTreeError && err.kind === 'not_found') {
        throw this.#error('part_not_found');
      }
      throw this.#error('unreachable');
    }
  }

  #outputs(part) {
    return {
      quantity: part.stock,
      minimum: part.minimum,
      on_order: part.ordering,
      low: isLow(part),
      text: partText(part, this.language),
    };
  }

  /** Scene action "Read the stock of a part". */
  async readPart(reference) {
    const part = await this.#freshPart(await this.resolvePart(reference));
    logger.debug(`Stock of part ${part.id} read by a scene`);
    return this.#outputs(part);
  }

  /**
   * Scene action "Remove stock": takes the quantity from the part's stock
   * items, oldest first, in one request. Refused unless enabled in the
   * configuration, and when the stock is short: InvenTree itself would
   * silently empty the items instead.
   */
  async removeStock(reference, rawQuantity) {
    if (!this.config.allowStockRemoval) {
      throw this.#error('removal_disabled');
    }
    const quantity = number(rawQuantity);
    if (quantity === null || quantity <= 0) {
      throw this.#error('quantity_invalid');
    }
    const part = await this.resolvePart(reference);
    let rows;
    try {
      rows = await this.client.stock({ part: String(part.id) });
    } catch {
      throw this.#error('unreachable');
    }
    // Serialized items are single pieces, tracked one by one: left alone.
    const items = rows
      .filter((row) => !row.serial && row.part === part.id && (number(row.quantity) ?? 0) > 0)
      .sort(
        (a, b) => (a.expiry_date ?? '9999').localeCompare(b.expiry_date ?? '9999') || a.pk - b.pk,
      );
    const available = items.reduce((sum, row) => sum + number(row.quantity), 0);
    if (available + 1e-9 < quantity) {
      throw this.#error('not_enough');
    }
    const taken = [];
    let left = quantity;
    for (const row of items) {
      if (left <= 1e-9) {
        break;
      }
      const take = Math.min(left, number(row.quantity));
      taken.push({ pk: row.pk, quantity: String(round(take, 5)) });
      left -= take;
    }
    try {
      await this.client.removeStock(taken, REMOVAL_NOTE);
    } catch (err) {
      if (err instanceof InvenTreeError && ['forbidden', 'unauthorized'].includes(err.kind)) {
        throw this.#error('forbidden');
      }
      logger.warn(`Stock removal refused: ${err.message}`);
      throw this.#error('failed');
    }
    logger.info(`Removed ${quantity} of part ${part.id} from ${taken.length} stock item(s)`);
    // The counts, devices and triggers follow at once.
    await this.refresh();
    const after = this.parts?.find((p) => p.id === part.id) ?? {
      ...part,
      stock: round(part.stock - quantity),
    };
    return this.#outputs(after);
  }
}
