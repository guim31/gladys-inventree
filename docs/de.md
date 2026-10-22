# InvenTree

Verfolge dein [InvenTree](https://inventree.org/)-Inventar in Gladys: die
Teile unter ihrem Mindestbestand, die leeren Teile, die laufenden Bestellungen
und den Lagerwert. Szenen können reagieren, wenn ein Teil knapp wird oder eine
Bestellung eintrifft, den Bestand eines Teils lesen und, wenn du es erlaubst,
Teile aus dem Lager entnehmen. Gladys spricht direkt mit deinem
InvenTree-Server, zu Hause oder gehostet.

Getestet mit einem echten InvenTree-1.6.1-Server (das offizielle Docker-Image,
mit PostgreSQL). Rückmeldungen sind im Gladys-Forum willkommen.

## Voraussetzungen

- Gladys Assistant 5.1 oder neuer.
- Ein InvenTree-Server (Version 1.0 oder neuer), vom Gladys-Rechner aus
  erreichbar: in deinem Netzwerk oder im Internet per HTTPS.
- Ein API-Token: Öffne in InvenTree deine Benutzereinstellungen,
  **Sicherheit**, **Zugriffstoken**, füge ein Token hinzu und kopiere es. Ein
  eigener Benutzer ist eine gute Idee. Seine Rollen (Admin, Gruppen) bestimmen,
  was Gladys sieht:
  - **Teile: Ansicht**, erforderlich;
  - **Bestellungen: Ansicht**, für laufende und erhaltene Bestellungen;
  - **Lagerartikel: Ansicht**, für den Lagerwert;
  - **Lagerartikel: Ändern**, nur für die Entnahme aus einer Szene.

## Konfiguration

1. Öffne den Tab **Konfiguration** der Integration.
2. Gib unter **InvenTree-Adresse** die Adresse ein, die du im Browser öffnest,
   zum Beispiel `http://192.168.1.50:8000` oder
   `https://inventree.example.org`.
3. Füge das **API-Token** ein (mit oder ohne das Wort `Token` davor).
4. **InvenTree lesen alle**: 5, 15 (Standard), 30 Minuten oder 1 Stunde.
5. **Ein Gerät pro Teil**: keines, die vom Token-Benutzer abonnierten Teile
   (der Stern auf der Seite eines Teils, Standard) oder alle Teile mit
   Mindestbestand. Höchstens 50 Teile.
6. **Szenen dürfen Bestand entnehmen**: standardmäßig aus. Schalte es nur ein,
   wenn eine Szene Teile aus InvenTree entnehmen soll.
7. **Sprache der Namen und Meldungen** legt die Namen der Funktionen (beim
   Hinzufügen des Geräts festgelegt) und die Texte der Szenenaktionen fest.
   Standardmäßig Französisch.
8. Speichere und nutze dann **Verbindung testen**: sie zeigt die
   InvenTree-Version, die Anzahl der Teile, die unter Mindestbestand und die
   laufenden Bestellungen.
9. Füge im Tab **Erkennung** das Gerät **InvenTree** und die gewünschten
   Teile-Geräte hinzu.

## Geräte

Das Gerät **InvenTree**:

| Funktion                   | Bedeutung                                                                        |
| -------------------------- | -------------------------------------------------------------------------------- |
| Teile                      | Aktive Teile (ohne virtuelle Teile)                                              |
| Teile unter Mindestbestand | Teile mit Mindestbestand und einem Gesamtbestand echt darunter (InvenTree-Regel) |
| Teile nicht vorrätig       | Teile mit Mindestbestand und nichts mehr auf Lager                               |
| Laufende Bestellungen      | Ausstehende, aufgegebene oder angehaltene Bestellungen                           |
| Überfällige Bestellungen   | Bestellungen nach ihrem Zieldatum                                                |
| Lagerwert                  | Menge × Einkaufspreis der Lagerartikel, in der Hauptwährung von InvenTree        |

Preise in einer anderen Währung werden mit den Wechselkursen von InvenTree
umgerechnet; ein Artikel ohne Preis zählt nicht. Der Wert hat die Einheit
Euro, Dollar oder Pfund, wenn das die Hauptwährung von InvenTree ist.

Jedes **Teile-Gerät** (nach dem Teil benannt) hat: Menge auf Lager (mit
Verlauf), Mindestbestand und bestellte Menge. Der Bestand eines Teils enthält
seine Varianten, wie in InvenTree.

Darf der Benutzer des Tokens die Bestellungen oder die Lagerartikel nicht
sehen, bleiben diese Funktionen leer, statt eine falsche Null zu zeigen.

## Dashboard-Widget

**Nachzubestellende Teile**: Kacheln mit den Teilen unter Mindestbestand, den
leeren Teilen und den laufenden Bestellungen (orange, wenn eine überfällig
ist), und die Liste der nachzubestellenden Teile, die leersten zuerst: Menge,
Minimum, bestellte Menge.

## Szenen-Auslöser

- **Teil unter Mindestbestand**: ein Teil fällt unter seinen Mindestbestand.
  Variablen: Teil, IPN, Kategorie, Menge auf Lager, Mindestbestand, bestellte
  Menge. Das Teil wird erneut gemeldet, nachdem es wieder sein Minimum
  erreicht hat.
- **Teil nicht vorrätig**: ein Teil mit Mindestbestand ist ganz leer.
  Variablen: Teil, IPN, Kategorie, Mindestbestand, bestellte Menge.
- **Bestellung erhalten**: eine laufende Bestellung ist in InvenTree
  abgeschlossen. Variablen: Bestellnummer, Lieferant, Beschreibung, Anzahl der
  Positionen.

Das erste Lesen nach der Installation ist still: was schon knapp ist, wird
nicht gemeldet. Ein Neustart meldet nichts doppelt. Höchstens 10 Ereignisse
jeder Art pro Lesevorgang (ein Massenimport überflutet deine Szenen nicht).

## Szenen-Aktionen

- **Bestand eines Teils lesen**: gib das Teil mit seinem Namen, seiner IPN,
  einem Namensteil, den nur ein Teil hat, oder seiner Nummer (`#12`) an.
  Ausgaben: Menge auf Lager, Mindestbestand, bestellte Menge, unter
  Mindestbestand (ja/nein) und ein Satz wie „Arduino Nano: 2 auf Lager,
  Minimum 3, 5 bestellt.“.
- **Bestand entnehmen** (nur wenn in der Konfiguration erlaubt): entnimmt
  eine Menge eines Teils, zuerst aus den ältesten Lagerartikeln, und trägt sie
  in den Verlauf von InvenTree ein („Removed by a Gladys Assistant scene“).
  Reicht der Bestand nicht, wird nichts entnommen. Serialisierte Artikel
  bleiben unberührt. Dieselben Ausgaben wie beim Lesen.

## Szenenbeispiele

- **Einkaufsliste**: Auslöser „Teil unter Mindestbestand“ → Nachricht
  „{{triggerEvent.data.part}} nachkaufen: noch {{triggerEvent.data.quantity}}
  (Minimum {{triggerEvent.data.minimum}})“.
- **Paket angekommen**: Auslöser „Bestellung erhalten“ → Nachricht
  „Bestellung {{triggerEvent.data.order}} von
  {{triggerEvent.data.supplier}} erhalten“.
- **Filament für den nächsten Druck**: jeden Abend → „Bestand eines Teils
  lesen“ `PLA schwarz` → nur fortfahren, wenn „unter Mindestbestand“ wahr ist
  → den Satz als Nachricht senden.
- **Kaffeekapseln**: ein Tastendruck → „Bestand entnehmen“ `Kaffeekapseln`, 1.

## Fehlerbehebung

- **„Token abgelehnt“**: das Token wurde widerrufen oder ist abgelaufen;
  erstelle ein neues.
- **„Der Benutzer dieses Tokens darf die Teile nicht sehen“**: gib dem
  Benutzer die Rolle **Teile** (Ansicht) oder nutze das Token eines anderen
  Benutzers.
- **„Diese Adresse antwortet nicht wie InvenTree“**: prüfe die Adresse (die
  der Weboberfläche, mit ihrem Port) und dass kein Proxy vorher eine Anmeldung
  verlangt.
- **Keine Bestellungen, kein Wert**: dem Benutzer des Tokens fehlt die Rolle
  **Bestellungen** oder **Lagerartikel** (Ansicht); die Protokolle der
  Integration sagen es einmal.
- **Kein Teile-Gerät**: abonniere die Teile (Stern) mit dem Benutzer des
  Tokens oder wähle „Alle Teile mit Mindestbestand“.
- Ausführliche Protokolle: setze die Variable `LOG_LEVEL` des Containers auf
  `debug`.

## Grenzen

- Ein InvenTree-Server pro Integration.
- InvenTree benachrichtigt nicht: Änderungen kommen beim nächsten Lesen in
  Gladys an (standardmäßig 15 Minuten), oder sofort nach einer Entnahme durch
  eine Szene.
- Ein Teil ohne Mindestbestand ist nie „unter Mindestbestand“ oder „nicht
  vorrätig“: gib den Teilen, die du verfolgen willst, ein Minimum (auch 1).
- Der Wert zählt nur Lagerartikel mit Einkaufspreis.
- Verkaufsaufträge, Fertigungen und die anderen InvenTree-Module werden nicht
  verfolgt.
- Nicht mit dem InvenTree-Projekt verbunden.
