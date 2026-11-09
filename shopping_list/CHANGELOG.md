# Changelog

## 3.6.0
- Photos: choose one from the gallery or take a new one, for items, products and recipes
- Tonight's dinner on your Home Assistant dashboard: the add-on now publishes `sensor.tonights_dinner` (photo, times, tomorrow and the week ahead) and `sensor.shopping_list_items` itself; ready-made cards in homeassistant/dashboard-cards.yaml
- Shop mode (🛒 Shop): big rows in aisle order, tap to tick with undo, progress bar and trolley total, screen stays on, end-of-shop summary with what's still to get
- What can I make?: tell it what you've got and it ranks your recipes by what's missing, then add the missing bits or have it tonight in one tap
- New option `ha_sensors` (on by default)

## 3.5.0
- Type-ahead: the app remembers everything you've ever added and how often
- As you type it fills in the rest in grey ("ba" → bananas); Enter or → accepts, keep typing for something new
- Matches listed under the box, best first (starts with what you typed, then most added and most recent), showing the brand note and whether it's already on the list; tap to add
- Quantities still work ("2 bas" → 2 basmati rice), and other names find the product ("baked" → Beans)
- Tap the box with nothing typed to see what you add most; ✕ stops suggesting something
- History is filled in from what you've already bought and listed, so it works straight away

## 3.4.0
- Meals tab: Monday to Sunday evening meal planner, move between weeks, one dinner a day — a recipe or just "Leftovers", "Takeaway", "Eating out"…
- Set how many each meal is for; "Add the week's ingredients" adds everything for the week's recipes in one go
- Recipes now look like a cookbook page: photo, description, serves, prep & cook times, tags, ingredients with section headings, numbered method, notes
- Cook mode: bigger text, tap steps off as you go, screen stays on
- Write and edit recipes fully (with your own photo); imports now bring in times, description and tags
- Recipe book: search and filter by tag
- `/api/meals/today` for a "Tonight's dinner" sensor in Home Assistant (example in homeassistant/)

## 3.3.0
- Works through patchy signal in the shop: ticks, quantity changes and additions made with no signal show straight away, are kept on the phone and sync when the signal is back
- The last loaded list opens instantly, even before the add-on answers
- Loyalty cards (💳 on the list): scan your Clubcard or keyfob, or type the number, and show it full-screen at the till

## 3.2.0
- Recipes tab: paste a recipe link (BBC Good Food and most recipe sites) or type one in
- Change the servings and the amounts scale
- Choose which ingredients to add: salt, oil and things already on the list start unticked; each item gets the recipe line as its note and lands in the right aisle
- This week: plan recipes for the next 7 days and add the whole week's ingredients in one go
- Spices and other cupboard staples now go in Food cupboard

## 3.1.0
- Two-way sync with Home Assistant to-do lists (default `todo.shopping_list`):
  "add milk to the shopping list" via Assist lands here, and the list shows in HA's To-do dashboard and cards
- Add `todo.alexa_shopping_list` (Alexa Devices integration) to sync with Alexa too
- Ticks, quantity changes ("beans ×3") and removals go both ways; "milk" merges into Whole milk
- Choose which list is mirrored with `ha_sync_list` (default: the first list)

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
