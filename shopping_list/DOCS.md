# Shopping List: a Home Assistant add-on

A shared shopping list for the household. It runs as a Home Assistant add-on and appears as **Shopping** in the HA sidebar and the HA phone app.

- **Add things fast.** Type "2 beans" and the quantity is set. Names you've used before are suggested as you type, and adding the same thing twice raises the quantity rather than creating a second line.
- **Usuals bar** at the top of the list. Tap a chip to add one item, or tap **+ Add all** for the whole weekly set.
- **Products** record exactly what you mean, so "beans" means *Branston Baked Beans 410g*. Each product can have other names, a usual quantity, a ★ usual flag and barcodes.
- **Barcode scanning** with the phone camera. A barcode you've scanned before adds that product straight away. A new barcode is looked up on Open Food Facts and saved as a product with its name and picture, so the next scan is instant.
- **Tick off** items as you shop. They move to **Done** until you clear them, and the list stays in sync across phones.

## Install

1. In HA, go to **Settings → Add-ons → Add-on store**, open the ⋮ menu, choose **Repositories** and add `https://github.com/tommiethefox80/ha-shopping-list`.
2. **Shopping List** then appears in the store. If it doesn't, use **⋮ → Check for updates**.
3. Install and start it, then turn on **Show in sidebar**.

It's a small Node app on Alpine (amd64 and aarch64) and uses very little memory.

**Barcode camera:** phone browsers only allow camera access over **HTTPS**. Open HA through its `https://` address (Nabu Casa, or Tailscale with HTTPS certificates). Over plain `http://` on the LAN, the scanner falls back to typing the barcode number.

**Upgrading from 1.x:** your list, usuals, products and barcodes are kept. Each product's Tesco name becomes its "we mean" note.

### Options

| Option | Default | Notes |
|---|---|---|
| `api_token` | empty | Needed for calls that don't come through ingress, e.g. HA's `rest_command`. |

## Voice and automations

`homeassistant/` contains a `rest_command`, an `intent_script` and custom sentences. With those set up, you can say "*Add 2 beans to the shopping list*" through Assist, or add items from any automation.

The API is plain JSON:

| Call | What it does |
|---|---|
| `POST /api/items {"text": "2 beans"}` | Adds an item |
| `POST /api/usuals/add` | Adds all the usuals |
| `POST /api/scan {"ean": "5000157024671"}` | Adds an item by barcode |
| `GET /api/state` | Returns the list and products |

## Releasing

1. Bump `version` in `shopping_list/config.yaml`.
2. Add a `## X.Y.Z` section to `shopping_list/CHANGELOG.md`.
3. Push to `main`.

CI runs the tests, builds the image on amd64 and arm64, then tags `vX.Y.Z` and publishes the GitHub release. Home Assistant then offers the update.

## Development

```bash
cd shopping_list/server && npm install && npm test   # unit + API tests
cd shopping_list/web && npm install && npm run dev    # UI on :5173, proxies /api to :8099
cd shopping_list/server && npm run dev                # API on :8099 (uses ./data)
```
