# InvenTree for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for
[InvenTree](https://inventree.org/), the open-source inventory management
system: follow the parts below their minimum stock, the parts out of stock, the
purchase orders on the way and the value of the stock, react to them in scenes,
read the stock of a part and, if you allow it, take parts out of the stock.

Tested against a real InvenTree 1.6.1 server (official Docker image, with
PostgreSQL).

## Features

- **An InvenTree device**: parts, parts below minimum, parts out of stock,
  purchase orders in progress and overdue, value of the stock (converted with
  InvenTree's exchange rates).
- **One device per part** you follow (the parts the token's user subscribed to,
  or every part with a minimum stock): quantity in stock with history, minimum,
  quantity on order.
- **Dashboard widget** "Parts to restock": tiles and the parts below minimum,
  the emptiest first.
- **Scene triggers**: "Part below minimum", "Part out of stock" and "Purchase
  order received", once each, remembered across restarts.
- **Scene actions**: "Read the stock of a part" (by name, IPN or number) and
  "Remove stock" (off unless enabled in the configuration; never removes more
  than there is).
- Texts in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1 or later.
- InvenTree 1.0 or later, reachable from Gladys (local network, or hosted over
  HTTPS).
- An API token (InvenTree → user settings → Security → Access tokens) of a user
  with the "Parts" role (view); "Purchase orders" and "Stock items" (view) for
  the orders and the value; "Stock items" (change) only for the removal.

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-inventree` (or find **InvenTree** in the
   catalog).
2. In **Configuration**, enter the address of InvenTree and the API token.
   Save, then **Test the connection**.
3. Add the **InvenTree** device and the part devices from the **Discover** tab.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

InvenTree pushes nothing: the container reads its REST API every 15 minutes by
default (5 minutes to 1 hour): the active parts, the outstanding purchase
orders, the stock items and the exchange rates, 500 rows per request. The
devices are published with `should_poll: false`; only changed states are sent
to Gladys, with a heartbeat every 6 hours. "Below minimum" is InvenTree's own
rule: a minimum stock above zero and a total stock strictly below it.

The removal checks the stock first and takes it from the items expiring first, then the
oldest, in one request: InvenTree itself would silently empty an item when asked for more
than it holds.

## Limitations

- One InvenTree server per integration.
- Changes reach Gladys at the next read, or at once after a removal made by a
  scene.
- Parts without a minimum stock are never below minimum nor out of stock.
- Sales orders, builds and the other InvenTree modules are not followed.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and a fake InvenTree answering with
bodies recorded on a real InvenTree 1.6.1 server
(`test/fixtures/inventree/1.6.1/`, demo data).

## Credits

- [InvenTree](https://github.com/inventree/InvenTree), by Oliver Walters and
  contributors (MIT): this integration only talks to its REST API and contains
  none of its code.
- The cover shows the official InvenTree logo, taken from the
  [InvenTree repository](https://github.com/inventree/InvenTree) (MIT).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by the InvenTree
project.

## License

Apache-2.0, see [`LICENSE`](LICENSE).
