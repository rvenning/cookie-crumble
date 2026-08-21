# Cookie Crumble 🍪

Run a cookie shop. Mix the dough, cut the shape somebody asked for, catch the
oven on the green stripe, ice it, and get it to the counter before anybody gives
up waiting.

**[▶️ Play it](https://rvenning.github.io/cookie-crumble/)**

The game was invented by **Dulcie**, who wrote down all eight steps — get the
ingredients, roll out the dough, put it in the tray, into the oven, take it out,
decorate it, sell it, they give you money — and they are all in here.

## Features

- **Twenty shifts across five weeks**, each ending on a Big Day: the school fete,
  a birthday party, the village show, a wedding, and the Grand Bake-Off.
- **The oven is the game.** A tray has a narrow "just right" window and an amber
  tail after it. Being somewhere else when it opens is normal — that is what
  makes a second oven shelf worth saving up for.
- **Your hands hold one tray.** The only scarcity in the shop, and the reason the
  cooling rack is more than decoration.
- **Nothing is lost by mistake.** A tray pulled out early goes back in and keeps
  baking. The wrong plate comes back to your hands. A mis-iced tray can be
  scraped. Mistakes cost time, and time is what the queue is counting.
- **Six cutters, six icings and sprinkles**, all handed out by the shift itself —
  the Corner Shop only ever sells slack, never something an order needs.
- **The Corner Shop**: a bigger mixer, more oven shelves, a cooling rack, a wider
  timer window, a prettier sign, an icing scraper — plus twelve shop trims that
  do nothing at all except look nice.
- **The Big Rush**, an endless mode where patience shrinks with every customer
  and never levels off. It is the family leaderboard.
- Family profiles with PINs, cross-device sync, offline play, installable as an
  app.

## Built on gamekit

Screens, profiles, storage/sync, sound and PWA install come from
[gamekit](https://github.com/rvenning/gamekit), vendored into `lib/`. To pick up
a newer kit:

```
node ../gamekit/tools/sync-to-game.js "../cookie-crumble"
```

Never edit `lib/` directly — it is a vendored copy and the next sync overwrites
it. Bump `CACHE` in `sw.js` after any shell change.

## How it is put together

No build step: plain `<script>` tags, in this order.

| File | What it holds |
|---|---|
| `js/recipes.js` | Cutters, icings, the oven's bands, what a cookie is worth |
| `js/shifts.js` | The twenty shifts, the five weeks, The Big Rush |
| `js/upgrades.js` | The Corner Shop, and the kitchen a profile plays with |
| `js/game.js` | The kitchen simulation — no DOM, no canvas, no audio |
| `js/storage.js` | Save shape and the cross-device merge |
| `js/render.js` | The canvas kitchen and every tap |
| `js/main.js` | Screens, the shop, results, the frame loop |

`game.js` touches nothing outside itself, so `tests/bot.test.js` plays the real
twenty-shift campaign headlessly with four bots: an attentive grown-up, an
ordinary child who shops as she goes, a hurried one, and one that does nothing.

## Tests

```
npm test
```

`CC_REPORT=1 node --test tests/bot.test.js` prints the per-shift balance table.

- `tests/recipes.test.js` — every order a customer holds up can be made from
  that morning's shopping; the oven gauge on screen is the window the engine
  grades; a week only ever gets harder.
- `tests/bot.test.js` — nothing is unwinnable on the starting kitchen, and an
  ordinary child shopping as she goes is never stuck (mean 1.01 attempts a
  shift).
- `tests/storage.test.js` — the sync merge, in both argument orders.

## Local development

```
npx http-server . -p 8120 -c-1
```

Then <http://localhost:8120/index.html>. `?debug=1` adds a dev panel — note it
disables saving on purpose, so never check persistence on it.

## Storage

`localStorage` under the `ck_` prefix, synced to the `cookiecrumble` Firestore
collection in the shared family project. The Firebase key in
`js/firebase-config.js` is a public client config restricted to the Cloud
Firestore API, not a secret.

Coins are stored as two monotonic counters, `coinsEarned` and `coinsSpent`, and
the balance is derived — a stored balance merged with `max()` would resurrect
spent coins the next time two devices synced.
