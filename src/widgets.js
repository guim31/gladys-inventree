// -----------------------------------------------------------------------------
// The "Parts to restock" dashboard widget: tiles (below minimum, out of
// stock, purchase orders in progress when readable) and the parts below
// their minimum, the emptiest first. Read only: no button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from './hub.js';
import { formatNumber } from './texts.js';

export const MAX_ITEMS = 8;

export const TEXT = {
  low: { en: 'Below minimum', fr: 'Sous le seuil', de: 'Unter Minimum', es: 'Bajo el mínimo' },
  out: { en: 'Out of stock', fr: 'En rupture', de: 'Nicht vorrätig', es: 'Agotados' },
  orders: { en: 'Orders', fr: 'Commandes', de: 'Bestellungen', es: 'Pedidos' },
  badge_out: { en: 'Out', fr: 'Rupture', de: 'Leer', es: 'Agotado' },
  badge_low: { en: 'Low', fr: 'Bas', de: 'Knapp', es: 'Bajo' },
  minimum: { en: 'min.', fr: 'min.', de: 'min.', es: 'mín.' },
  on_order: { en: 'on order', fr: 'en commande', de: 'bestellt', es: 'pedidos' },
  nothing: {
    en: 'Nothing to restock.',
    fr: 'Rien à réapprovisionner.',
    de: 'Nichts nachzubestellen.',
    es: 'Nada que reponer.',
  },
  waiting: {
    en: 'Waiting for InvenTree: check the configuration of the integration.',
    fr: "En attente d'InvenTree : vérifiez la configuration de l'intégration.",
    de: 'Warte auf InvenTree: prüfe die Konfiguration der Integration.',
    es: 'Esperando a InvenTree: compruebe la configuración de la integración.',
  },
};

const pick = (table, language) => table[language] ?? table.en;
const cut = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

/** The card-list rows of the parts below their minimum. */
export function restockItems(parts, language) {
  const n = (value) => formatNumber(value, language);
  return parts.slice(0, MAX_ITEMS).map((part) => {
    const units = part.units ? ` ${part.units}` : '';
    const ordering =
      part.ordering > 0 ? ` · ${n(part.ordering)} ${pick(TEXT.on_order, language)}` : '';
    return {
      title: cut(part.name, 60),
      subtitle: cut(
        `${n(part.stock)}${units} / ${pick(TEXT.minimum, language)} ${n(part.minimum)}${ordering}`,
        80,
      ),
      badge:
        part.stock <= 0
          ? { text: pick(TEXT.badge_out, language), color: WIDGET_COLORS.DANGER }
          : { text: pick(TEXT.badge_low, language), color: WIDGET_COLORS.WARNING },
    };
  });
}

export function buildContent(hub, { language = 'en' } = {}) {
  const summary = hub.summary;
  if (!summary) {
    return {
      ttl_seconds: 60,
      components: [{ type: 'text', variant: 'body', text: pick(TEXT.waiting, language) }],
    };
  }
  const low = summary.low.length;
  const out = summary.out.length;
  return {
    // The hub nudges the widget after every read.
    ttl_seconds: 900,
    components: [
      {
        type: 'value',
        label: pick(TEXT.low, language),
        value: low,
        icon: 'trending-down',
        color: low > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
      },
      {
        type: 'value',
        label: pick(TEXT.out, language),
        value: out,
        icon: 'alert-triangle',
        color: out > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
      },
      // A token that may not view the orders: no tile rather than a false 0.
      ...(summary.orders
        ? [
            {
              type: 'value',
              label: pick(TEXT.orders, language),
              value: summary.orders.length,
              icon: 'truck',
              ...(summary.overdue > 0 ? { color: WIDGET_COLORS.WARNING } : {}),
            },
          ]
        : []),
      low > 0
        ? { type: 'card-list', display: 'list', items: restockItems(summary.low, language) }
        : { type: 'text', variant: 'caption', text: pick(TEXT.nothing, language) },
    ],
  };
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    get: (hub, request) => buildContent(hub, request),
  },
};
