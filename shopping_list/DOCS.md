# Shopping List: a Home Assistant add-on

A shared shopping list for the household. It runs as a Home Assistant add-on and appears as **Shopping** in the HA sidebar and the HA phone app.

- **Add things fast.** Type "2 beans" and the quantity is set. Names you've used before are suggested as you type, and adding the same thing twice raises the quantity rather than creating a second line.
- **Usuals bar** at the top of the list. Tap a chip to add one item, or tap **+ Add all** for the whole weekly set.
- **Products** record exactly what you mean, so "beans" means *Branston Baked Beans 410g*. Each product can have other names, a usual quantity, a ★ usual flag and barcodes.
- **Barcode scanning** with the phone camera. A barcode you've scanned before adds that product straight away. A new barcode is looked up on Open Food Facts and saved as a product with its name and picture, so the next scan is instant.
- **Aisles**: items are sorted into aisles automatically, in the order you walk the shop. Each list has its own order, and if you move an item to a different aisle once, it's remembered.
- **Running low?** suggests things you buy regularly that are about due, based on how often you buy them.
- **Live sync**: changes appear on every phone instantly. **Recent changes** shows who added or got what, using people's Home Assistant names.
- **Multiple lists** (weekly shop, Aldi, B&Q…), each item with an optional **note** and a **photo** of the exact product.
- **Prices** are remembered per product, with a running total for the list and for what's in the trolley.
- **Tick off** items as you shop. They move to **Got it** until you clear them.

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
| `ha_todo_entities`, `ha_sync_list` | | See *Home Assistant to-do sync* below |
| `api_token` | empty | Needed for calls that don't come through ingress, e.g. HA's `rest_command`. |

## Home Assistant to-do sync (voice, Alexa, dashboards)

The add-on keeps one of its lists in step with Home Assistant to-do lists, in both directions:

- **Assist:** "*Add milk to the shopping list*" lands on your list. "milk" merges into **Whole milk** if it's already there.
- **Alexa:** add `todo.alexa_shopping_list` (from HA's Alexa Devices integration) to `ha_todo_entities`, and Alexa additions arrive too.
- **HA dashboards and automations:** use the normal To-do list card, or `todo.*` triggers and actions, e.g. a notification when something is added.
- Ticks, quantities (shown in HA as "beans ×3") and removals sync both ways. The app stays in charge of products, aisles, notes and photos.

| Option | Default | Notes |
|---|---|---|
| `ha_todo_entities` | `todo.shopping_list` | The HA to-do lists to sync. Leave empty to turn syncing off. |
| `ha_sync_list` | first list | The name of the list to mirror, e.g. `Weekly shop`. |

`todo.shopping_list` comes from HA's built-in **Shopping list** integration (Settings → Devices & services → Add → Shopping list). Anything already on it is added to your list the first time it syncs.

If you run the add-on outside Home Assistant (Docker on the NUC), set `HA_URL` and `HA_TOKEN` (a long-lived access token) as well.

`homeassistant/` also has an optional `rest_command` for automations that call this add-on's own API directly.

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
