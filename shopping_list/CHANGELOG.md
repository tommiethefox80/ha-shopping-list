# Changelog

## 1.0.1
- Fix install on Home Assistant: build from the Playwright image regardless of the base image Supervisor passes in

## 1.0.0
- Shopping list with quantities ("2 beans"), manual tick-off and a Done section
- Usuals bar at the top of the list (tap one, or add all)
- Products page: names → exact Tesco products, aliases, usual quantity, barcodes
- Phone barcode scanning (known barcodes go straight on the list; unknown ones looked up on Open Food Facts)
- Send to Tesco: adds unticked items to the Tesco basket and ticks them off as they go in
- Tesco sign-in viewer for the add-on's background browser
- API + Assist sentences for adding items from Home Assistant
