# Shopping List: a Home Assistant add-on

A shared shopping list for the household, which runs as a Home Assistant add-on and appears as **Shopping** in the HA sidebar and the HA phone app.

- **The list comes first.** Type items ("2 beans" sets the quantity), scan barcodes with the phone camera, and tick things off by hand when you shop in store.
- **Usuals bar** at the top of the list. Tap a chip to add one item, or tap **+ Add all** for the whole weekly set.
- **Products** page that records what each name means. For example, "beans" means *Branston Baked Beans In Tomato Sauce 410G* and "chopped tomatoes" means product 251825089. Each product can have other names, a usual quantity, a ★ usual flag and barcodes.
- **Rules**: "use this instead when it's on offer". For example, Nappies → Fred & Flo, but Pampers when Pampers are on offer. When you press Send, a review sheet shows what each rule picked, with this week's offers, so you can change it before anything is added.
- **Send to Tesco** (secondary). Adds every unticked item to your Tesco.com basket and ticks each one off as it goes in. You then book a slot and check out on Tesco as usual.

## How Send to Tesco works

Tesco has no public API, so the add-on runs its own Chromium browser through Playwright. It uses the website the same way you would:

1. It checks the browser is still signed in to your Tesco account. If not, it stops and asks you to sign in on the **Tesco** tab.
2. For each item it works out which product you mean, in this order: a product chosen for that item → the barcode → the item name or one of the product's other names (plurals are ignored).
3. If the item has a product, it opens that product's page and clicks **Add** once per unit of quantity. It waits for Tesco to confirm the basket change before ticking the item off.
4. If the item has no product yet, it searches Tesco and marks the item **Pick product**. Tap the item, choose one of the results, and leave **Remember as the default** ticked so the choice is saved for next time.
5. If the product has an "if on offer" rule, it checks the offer products' search results on Tesco first. The first one that's on offer and in stock is used instead. If you pressed Send in the app, you'll already have confirmed or changed this choice on the review sheet.
6. Unavailable products are flagged on the list and left there.

There's a pause of 1.5–3.5 seconds between items, so it adds items at about the speed a person would.

### Signing in

The add-on's browser keeps its own Tesco session, stored in `/data/browser-profile`. To sign in:

1. Open **Tesco → Sign in to Tesco**. A live picture of the add-on's browser appears.
2. Enter your Tesco email and tap **Next**, then your password and tap **Sign in**. These go straight into the boxes on Tesco's page.
3. If Tesco asks for anything else, such as a one-time code, open **Something else**. Tap the box on the picture, then type into the field there.

What you type is passed straight to Tesco. It isn't stored or logged. Tesco signs the browser out every so often, and Send will tell you when that happens.

## Install (Home Assistant add-on)

1. In HA, go to **Settings → Add-ons → Add-on store**, open the ⋮ menu, choose **Repositories** and add `https://github.com/tommiethefox80/ha-shopping-list`.
2. **Shopping List** then appears in the store. If it doesn't, use **⋮ → Check for updates**.
3. Install it. The first build pulls Microsoft's Playwright image, which is about 2GB and includes Chromium, so it takes a while.
4. Start the add-on and turn on **Show in sidebar**.
5. Open **Shopping → Tesco**, sign in once, and you're set.

**Hardware:** Chromium needs roughly 1GB of free RAM while it's sending. It runs on amd64 and aarch64 (Pi 4/5, Home Assistant Green and Yellow). If your HA box is short on memory, use `docker-compose.yml` to run it on the NUC instead.

**Barcode camera:** phone browsers only allow camera access over **HTTPS**. Open HA through its `https://` address (Nabu Casa, or Tailscale with HTTPS certificates). Over plain `http://` on the LAN the scanner falls back to typing the barcode number.

**Barcodes:** if you scan a barcode that's already saved against a product, that product goes straight onto the list. Otherwise the add-on looks the barcode up on Open Food Facts to get a name, then adds the item for you to match. Once the item has been sent or matched, the barcode is saved, so it matches straight away next time.

### Options

| Option | Default | Notes |
|---|---|---|
| `headless` | `false` | Runs Chromium "headed" on a virtual display, which looks more like a normal browser to Tesco. Set to `true` to save a little memory. |
| `api_token` | empty | Needed for calls that don't come through ingress, e.g. HA's `rest_command`. |
| `tesco_base_url` | empty | Leave empty. Only for testing against a mock site. |

## Voice and automations

`homeassistant/` contains a `rest_command`, an `intent_script` and custom sentences. With those set up, you can say "*Add 2 beans to the shopping list*" through Assist, or add items from any automation.

The API is plain JSON. These calls can be made from Home Assistant:

| Call | What it does |
|---|---|
| `POST /api/items {"text": "2 beans"}` | Adds an item |
| `POST /api/usuals/add` | Adds all the usuals |
| `POST /api/send` | Starts Send to Tesco |
| `GET /api/state` | Returns the list, products and send status |

## Releasing

1. Bump `version` in `shopping_list/config.yaml`.
2. Add a `## X.Y.Z` section to `shopping_list/CHANGELOG.md`.
3. Push to `main`.

CI runs the tests, builds the image, then tags `vX.Y.Z` and publishes the GitHub release. Home Assistant offers the update once it sees the new version.

## Development

```bash
cd shopping_list/server && npm install && npm test   # unit tests + end-to-end against a mock Tesco in real Chromium
cd shopping_list/web && npm install && npm run dev    # UI on :5173, proxies /api to :8099
cd shopping_list/server && npm run dev                # API on :8099 (uses ./data)
```

`server/test/mockTesco.ts` is a stand-in for tesco.com that copies the real page structure: `li[data-testid]` search tiles, `add 1 <name>` buttons, the **Sign out** link, `POST /bff` basket calls and the redirect to the sign-in page. `server/test/demo.ts` runs the whole app against it and takes phone-sized screenshots.

## When Tesco changes their site

Everything specific to Tesco is in `server/src/tesco/driver.ts`, and the selectors are listed at the top of that file. If Send starts failing with "Could not find the Add button" or searches come back empty, that file is the place to update.

## Caveats

- This automates your own Tesco account through the website. Tesco's terms don't allow automated access to the site. The add-on only ever touches your basket at human speed, but use it knowing that.
- If Tesco shows a security check (captcha or a one-time code) when you sign in, complete it in the sign-in viewer like any other step.
- The add-on never books slots and never checks out. Those stay with you.
