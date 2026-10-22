# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- An InvenTree device: parts, parts below minimum, parts out of stock, purchase
  orders in progress and overdue, value of the stock.
- One device per followed part (subscribed by the token's user, or every part
  with a minimum stock): quantity in stock, minimum, quantity on order.
- The "Parts to restock" dashboard widget: tiles and the parts below minimum,
  the emptiest first.
- Scene triggers "Part below minimum", "Part out of stock" and "Purchase order
  received", announced once, remembered across restarts.
- Scene actions "Read the stock of a part" and "Remove stock" (disabled unless
  enabled in the configuration).
- A token that may only view the parts still works: the orders and the value
  stay empty.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-inventree/commits/main
