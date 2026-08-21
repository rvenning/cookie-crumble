# Cookie Crumble 🫖

Run a village tearoom. Show people to a table, take the order, keep the urn and
the oven going, and get the tea out before anybody gives up waiting.

**[▶️ Play it](https://rvenning.github.io/cookie-crumble/)**

Every job is one tap and none of them is hard. What costs you is that you have to
*walk* there, and you can only be in one place — so the game is never "can I do
this?", it is always "what do I do next, and what goes cold while I do it?"

## Features

- **Twenty shifts across five weeks**, each ending on a Big Day — Saturday
  Opening, the Village Fete, the Long Saturday, the Birthday Rush, and the Grand
  Re-Opening.
- **Six taps and that's the game.** Seat, take the order, load your tray at the
  pass, serve, clear (they settle up as you wipe down). Plus three benches — urn,
  oven, icing — that cook while you're out on the floor.
- **A floor that fills up.** Six tables in five different states at once, each
  running down a clock, and only one of you.
- **Eight regulars, each breaking your routine in exactly one way** — the
  commuter who tips double and won't wait, the squirrels who leave crumbs, the
  badgers who'll sit all afternoon, the hedgehog who won't sit near anyone, the
  birthday bear who wants it all in one trip, and an inspector who'll close you
  down if she leaves unhappy.
- **Colour-matching and chaining.** Seat a guest on their own colour of
  tablecloth for a bonus; do the same job twice running for a multiplier. The
  quickest route and the best-scoring route are not the same route.
- **The shop sells seconds** — quicker shoes, a bigger tray, softer chairs, a
  better kitchen, a podium, a proper mop — plus twelve trims that go up in the
  room and do nothing at all except look nice.
- **The Saturday Rush**, endless and floorless, is the family leaderboard.
- Family profiles with PINs, cross-device sync, offline play, installable.

## Built on gamekit

Screens, profiles, storage/sync, sound and PWA install come from
[gamekit](https://github.com/rvenning/gamekit), vendored into `lib/`:

```
node ../gamekit/tools/sync-to-game.js "../cookie-crumble"
```

Never edit `lib/` directly — it is a vendored copy and the next sync overwrites
it. Bump `CACHE` in `sw.js` after any shell change.

## How it is put together

No build step: plain `<script>` tags, in this order.

| File | What it holds |
|---|---|
| `js/menu.js` | Dishes, the three benches, the eight guests, the five tablecloths |
| `js/shifts.js` | The room's geometry, four floor plans, twenty shifts, the Rush |
| `js/upgrades.js` | The shop, and the kitchen a profile plays with |
| `js/game.js` | The floor — no DOM, no canvas, no audio |
| `js/storage.js` | Save shape and the cross-device merge |
| `js/render.js` | The tearoom on a canvas, and every tap |
| `js/main.js` | Screens, the shop, the album, results, the frame loop |

**Geometry is content.** In a routing game the table positions are as much level
design as the customer schedule is, because walking is the only thing the player
spends. Two tables in opposite corners is a harder shift than the same two side
by side with no other number changed.

## Tests

```
npm test
```

- `tests/content.test.js` — every dish orderable today can be cooked today; no
  all-at-once order exceeds the *starting* tray; no two tap targets overlap; the
  campaign tightens.
- `tests/bot.test.js` — five bots on the real engine. `CC_REPORT=1 node --test
  tests/bot.test.js` prints the per-shift table.
- `tests/storage.test.js` — the sync merge, in both argument orders.

Two tools that did the actual work:

```
node tests/diag.js 7 base        # where one shift's time really goes
node tests/calibrate.js --write  # set star targets from what the bots score
```

`diag.js` answered in one run what several tuning passes could not: the first
build cost ~12s of server time per party against a 9s arrival gap, so every queue
grew without bound. Six shifts a party is now four.

An honest note from the bots: `greedy`, which ignores walking distance entirely
and just serves whoever is closest to leaving, scores within ~1% of the careful
planner. When the floor is saturated you have to visit everything anyway, so
triage-first is very nearly optimal. Distance matters *within* a good policy, not
instead of one — the assertion that holds is planner against `random`.

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

Coins are stored as two monotonic counters, `coinsEarned` and `coinsSpent`, with
the balance derived — a stored balance merged with `max()` would resurrect spent
coins the next time two devices synced.
