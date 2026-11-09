# Changelog

## 3.0.0
- Aisles: items are sorted into aisles automatically (UK grocery words), and each list has its own aisle order (⇅ Arrange aisles)
- Move an item to a different aisle once and it's remembered for next time
- "Running low?" suggestions from what you usually buy and how often
- Instant sync between phones, plus "Recent changes" showing who added or got what (uses your Home Assistant name)
- Multiple lists (e.g. Weekly shop, Aldi, B&Q), each with its own aisle order
- Item notes for this shop, and photos of the exact product
- Prices: remembered per product, with a running total for the list and what's in the trolley
- Autocomplete now suggests what you buy most first

## 2.0.0
- Now a pure shopping list: removed Send to Tesco, the Tesco sign-in and the background browser
  (Tesco's bot protection blocks automated browsers)
- Much smaller and lighter add-on: plain Node on Alpine instead of a 2GB browser image
- Products keep "exactly which one" as a note (e.g. Branston Baked Beans 410g); existing Tesco product names carried over
- Scanning an unknown barcode now saves it as a product with its name and picture, so the next scan is instant
- Your list, usuals, products and barcodes are kept when upgrading

## 1.1.1
- Tesco sign-in: separate Email (Next) and Password (Sign in) fields that fill Tesco's own boxes, instead of relaying keystrokes
- Sign-in picture falls back to Chrome's own capture when it stalls, and says when it may be out of date
- Typing into "something else" focuses the first text box if nothing is selected

## 1.1.0
- Rules: "use this instead when it's on offer" on any product, e.g. Pampers if on offer, otherwise Fred & Flo
- Send to Tesco shows a quick review of rule choices (with this week's offers) so you can override before anything is added
- Fix Tesco sign-in viewer showing a broken image: the browser could be launched twice at once, and screenshots stalled while Tesco was loading
- Sign-in viewer now shows what it's doing (and any error) instead of a broken image; errors are written to the add-on log

## 1.0.1
- Fix install on Home Assistant: build from the Playwright image regardless of the base image Supervisor passes in
- Fix start-up hang: start the virtual display directly

## 1.0.0
- Shopping list with quantities ("2 beans"), manual tick-off and a Done section
- Usuals bar at the top of the list (tap one, or add all)
- Products page: names → exact Tesco products, aliases, usual quantity, barcodes
- Phone barcode scanning (known barcodes go straight on the list; unknown ones looked up on Open Food Facts)
- Send to Tesco: adds unticked items to the Tesco basket and ticks them off as they go in
- Tesco sign-in viewer for the add-on's background browser
- API + Assist sentences for adding items from Home Assistant
