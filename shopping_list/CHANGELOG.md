# Changelog

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
