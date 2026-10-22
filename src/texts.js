// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface. German says "du", Spanish "usted" (test/i18n.test.js).
// -----------------------------------------------------------------------------

// Feature names (frozen by Gladys at creation).
export const NAMES = {
  en: {
    parts: 'Parts',
    low_stock: 'Parts below minimum',
    out_of_stock: 'Parts out of stock',
    purchase_orders: 'Purchase orders in progress',
    overdue_orders: 'Overdue purchase orders',
    stock_value: 'Stock value',
    quantity: 'Quantity in stock',
    minimum: 'Minimum stock',
    on_order: 'Quantity on order',
  },
  fr: {
    parts: 'Articles',
    low_stock: 'Articles sous le seuil',
    out_of_stock: 'Articles en rupture',
    purchase_orders: 'Commandes en cours',
    overdue_orders: 'Commandes en retard',
    stock_value: 'Valeur du stock',
    quantity: 'Quantité en stock',
    minimum: 'Stock minimum',
    on_order: 'Quantité en commande',
  },
  de: {
    parts: 'Teile',
    low_stock: 'Teile unter Mindestbestand',
    out_of_stock: 'Teile nicht vorrätig',
    purchase_orders: 'Laufende Bestellungen',
    overdue_orders: 'Überfällige Bestellungen',
    stock_value: 'Lagerwert',
    quantity: 'Menge auf Lager',
    minimum: 'Mindestbestand',
    on_order: 'Bestellte Menge',
  },
  es: {
    parts: 'Artículos',
    low_stock: 'Artículos bajo el mínimo',
    out_of_stock: 'Artículos agotados',
    purchase_orders: 'Pedidos en curso',
    overdue_orders: 'Pedidos atrasados',
    stock_value: 'Valor del stock',
    quantity: 'Cantidad en stock',
    minimum: 'Stock mínimo',
    on_order: 'Cantidad pedida',
  },
};

export const INIT_FAILED = {
  en: 'The integration could not start: see its logs.',
  fr: "L'intégration n'a pas pu démarrer : consultez ses journaux.",
  de: 'Die Integration konnte nicht starten: sieh dir ihre Protokolle an.',
  es: 'La integración no pudo iniciarse: consulte sus registros.',
};

// The connection status shown in the Configuration screen.
export const STATUS_TEXT = {
  en: {
    none: 'Enter the address of InvenTree.',
    invalid: 'The InvenTree address is not valid (http or https, without user name in it).',
    token: 'Enter an InvenTree API token.',
    unreachable: 'InvenTree does not answer: check its address and that it is running.',
    unauthorized: 'Token refused: check the API token (it may have expired or been revoked).',
    forbidden: 'The user of this token may not view the parts (role "Parts", view).',
    invalid_answer: 'This address does not answer like InvenTree (a proxy login page?).',
  },
  fr: {
    none: "Saisissez l'adresse d'InvenTree.",
    invalid:
      "L'adresse d'InvenTree n'est pas valide (http ou https, sans nom d'utilisateur dedans).",
    token: "Saisissez un jeton d'API InvenTree.",
    unreachable: 'InvenTree ne répond pas : vérifiez son adresse et qu’il est démarré.',
    unauthorized: "Jeton refusé : vérifiez le jeton d'API (il a peut-être expiré ou été révoqué).",
    forbidden:
      "L'utilisateur de ce jeton ne peut pas voir les articles (rôle « Pièces », lecture).",
    invalid_answer: 'Cette adresse ne répond pas comme InvenTree (page de connexion d’un proxy ?).',
  },
  de: {
    none: 'Gib die Adresse von InvenTree ein.',
    invalid: 'Die InvenTree-Adresse ist ungültig (http oder https, ohne Benutzername darin).',
    token: 'Gib ein InvenTree-API-Token ein.',
    unreachable: 'InvenTree antwortet nicht: prüfe die Adresse und ob es läuft.',
    unauthorized: 'Token abgelehnt: prüfe das API-Token (abgelaufen oder widerrufen?).',
    forbidden: 'Der Benutzer dieses Tokens darf die Teile nicht sehen (Rolle „Teile“, Ansicht).',
    invalid_answer: 'Diese Adresse antwortet nicht wie InvenTree (Anmeldeseite eines Proxys?).',
  },
  es: {
    none: 'Introduzca la dirección de InvenTree.',
    invalid: 'La dirección de InvenTree no es válida (http o https, sin nombre de usuario).',
    token: 'Introduzca un token de API de InvenTree.',
    unreachable: 'InvenTree no responde: compruebe su dirección y que esté en marcha.',
    unauthorized:
      'Token rechazado: compruebe el token de API (puede haber caducado o haber sido revocado).',
    forbidden: 'El usuario de este token no puede ver los artículos (rol «Piezas», ver).',
    invalid_answer: 'Esta dirección no responde como InvenTree (¿página de acceso de un proxy?).',
  },
};

// The "Test the connection" action. `orders` is null when the token may not
// view the purchase orders.
export const TEST_TEXT = {
  en: (version, parts, low, orders) =>
    `InvenTree ${version} answers: ${parts} part(s), ${low} below minimum` +
    (orders === null ? '.' : `, ${orders} purchase order(s) in progress.`),
  fr: (version, parts, low, orders) =>
    `InvenTree ${version} répond : ${parts} article(s), ${low} sous le seuil` +
    (orders === null ? '.' : `, ${orders} commande(s) en cours.`),
  de: (version, parts, low, orders) =>
    `InvenTree ${version} antwortet. Teile: ${parts}, unter Mindestbestand: ${low}` +
    (orders === null ? '.' : `, laufende Bestellungen: ${orders}.`),
  es: (version, parts, low, orders) =>
    `InvenTree ${version} responde: ${parts} artículo(s), ${low} bajo el mínimo` +
    (orders === null ? '.' : `, ${orders} pedido(s) en curso.`),
};

// Errors of the scene actions.
export const COMMAND_ERRORS = {
  en: {
    unreachable: 'InvenTree could not be read: see the status in the configuration.',
    part_missing: 'No part given: enter its name, IPN or number.',
    part_not_found: 'No active part in InvenTree has this name, IPN or number.',
    part_ambiguous: 'Several parts match this name: enter the IPN or the number.',
    quantity_invalid: 'The quantity must be a number above zero.',
    removal_disabled:
      'Stock removal is disabled: enable it in the configuration of the integration.',
    not_enough: 'Not enough stock to remove this quantity: nothing was removed.',
    forbidden: 'The user of the token may not change the stock (role "Stock", change).',
    failed: 'InvenTree refused the stock removal: see the logs of the integration.',
  },
  fr: {
    unreachable: "InvenTree n'a pas pu être lu : voyez l'état dans la configuration.",
    part_missing: 'Aucun article indiqué : saisissez son nom, sa référence interne ou son numéro.',
    part_not_found: "Aucun article actif d'InvenTree n'a ce nom, cette référence ou ce numéro.",
    part_ambiguous: 'Plusieurs articles portent ce nom : saisissez la référence ou le numéro.',
    quantity_invalid: 'La quantité doit être un nombre supérieur à zéro.',
    removal_disabled:
      "La sortie de stock est désactivée : activez-la dans la configuration de l'intégration.",
    not_enough: "Stock insuffisant pour retirer cette quantité : rien n'a été retiré.",
    forbidden:
      "L'utilisateur du jeton ne peut pas modifier le stock (rôle « Stock », modification).",
    failed: "InvenTree a refusé la sortie de stock : voyez les journaux de l'intégration.",
  },
  de: {
    unreachable:
      'InvenTree konnte nicht gelesen werden: sieh dir den Status in der Konfiguration an.',
    part_missing: 'Kein Teil angegeben: gib seinen Namen, seine IPN oder Nummer ein.',
    part_not_found: 'Kein aktives Teil in InvenTree hat diesen Namen, diese IPN oder Nummer.',
    part_ambiguous: 'Mehrere Teile haben diesen Namen: gib die IPN oder die Nummer ein.',
    quantity_invalid: 'Die Menge muss eine Zahl größer als null sein.',
    removal_disabled:
      'Die Lagerentnahme ist deaktiviert: aktiviere sie in der Konfiguration der Integration.',
    not_enough: 'Nicht genug Bestand für diese Menge: es wurde nichts entnommen.',
    forbidden: 'Der Benutzer des Tokens darf den Bestand nicht ändern (Rolle „Lager“, Ändern).',
    failed: 'InvenTree hat die Entnahme abgelehnt: sieh dir die Protokolle der Integration an.',
  },
  es: {
    unreachable: 'No se pudo leer InvenTree: consulte el estado en la configuración.',
    part_missing: 'Ningún artículo indicado: introduzca su nombre, su IPN o su número.',
    part_not_found: 'Ningún artículo activo de InvenTree tiene este nombre, IPN o número.',
    part_ambiguous: 'Varios artículos coinciden con este nombre: introduzca el IPN o el número.',
    quantity_invalid: 'La cantidad debe ser un número mayor que cero.',
    removal_disabled:
      'La salida de stock está desactivada: actívela en la configuración de la integración.',
    not_enough: 'No hay stock suficiente para retirar esta cantidad: no se retiró nada.',
    forbidden: 'El usuario del token no puede modificar el stock (rol «Stock», cambiar).',
    failed: 'InvenTree rechazó la salida de stock: consulte los registros de la integración.',
  },
};

/** { en, fr, de, es } of a coded command error. */
export function commandMessage(code) {
  return Object.fromEntries(
    Object.entries(COMMAND_ERRORS).map(([language, table]) => [language, table[code]]),
  );
}

// The sentence of the "Read the stock of a part" scene action, e.g. to send
// as a message or to say aloud.
export const PART_TEXT = {
  en: {
    stock: (name, quantity, units) => `${name}: ${quantity}${units} in stock`,
    minimum: (minimum) => `, minimum ${minimum}`,
    ordering: (quantity) => `, ${quantity} on order`,
  },
  fr: {
    stock: (name, quantity, units) => `${name} : ${quantity}${units} en stock`,
    minimum: (minimum) => `, minimum ${minimum}`,
    ordering: (quantity) => `, ${quantity} en commande`,
  },
  de: {
    stock: (name, quantity, units) => `${name}: ${quantity}${units} auf Lager`,
    minimum: (minimum) => `, Minimum ${minimum}`,
    ordering: (quantity) => `, ${quantity} bestellt`,
  },
  es: {
    stock: (name, quantity, units) => `${name}: ${quantity}${units} en stock`,
    minimum: (minimum) => `, mínimo ${minimum}`,
    ordering: (quantity) => `, ${quantity} en pedido`,
  },
};

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/** 1234.5 -> "1 234,5" (fr), "1,234.5" (en)... */
export function formatNumber(value, language) {
  return new Intl.NumberFormat(LOCALES[language] ?? LOCALES.en, {
    maximumFractionDigits: 3,
  }).format(value);
}

/** "Arduino Nano: 2 in stock, minimum 3, 5 on order." */
export function partText(part, language) {
  const texts = PART_TEXT[language] ?? PART_TEXT.en;
  const n = (value) => formatNumber(value, language);
  const units = part.units ? ` ${part.units}` : '';
  return (
    texts.stock(part.name, n(part.stock), units) +
    (part.minimum > 0 ? texts.minimum(n(part.minimum)) : '') +
    (part.ordering > 0 ? texts.ordering(n(part.ordering)) : '') +
    '.'
  );
}
