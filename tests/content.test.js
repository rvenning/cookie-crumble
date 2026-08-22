// Cookie Crumble — content.
//
// The promises this file keeps, none of which the balance bots would catch:
//   - every dish a guest can order can actually be cooked today
//   - every table a party can be seated at can hold them
//   - nothing an all-at-once guest wants exceeds the STARTING tray
//   - the room's geometry is sane, and the campaign gets harder
//
// Failures are collected and asserted as a list, so one run names every offender
// rather than stopping at the first.

const test = require("node:test");
const assert = require("node:assert");
const { load } = require("./load.js");

const S = load();
const {
  DISHES, DISH, STATIONS, STATION, GUESTS, GUEST, CLOTHS, CLOTH,
  SHIFTS, WEEKS, ROOMS, SPOTS, FIELD, PASS, DOOR, QUEUE_SLOTS, RUSH,
  UPGRADES, TRIMS, BASE_KIT, upgradeLoadout, payout, JOB, Game, __reseed,
} = S;

test("every dish a guest can order can be cooked today", () => {
  const fails = [];
  const check = (where, dishes) => {
    for (const d of dishes) {
      if (!DISH[d]) { fails.push(`${where}: unknown dish ${d}`); continue; }
      const st = STATION[DISH[d].station];
      if (!st) fails.push(`${where}: ${d} has no station`);
      const makes = Array.isArray(st.makes) ? st.makes : [st.makes];
      if (!makes.includes(d)) fails.push(`${where}: the ${st.id} does not make ${d}`);
    }
  };
  SHIFTS.forEach((s, i) => check(`${i + 1}. ${s.name}`, s.dishes));
  check("The Saturday Rush", RUSH.dishes);
  assert.deepEqual(fails, []);
});

test("nobody orders more than the starting tray can carry in one trip", () => {
  // An all-at-once guest whose order does not fit the BASE tray cannot be served
  // without shopping — and worse, she fills both hands and cannot free one to
  // fetch what would complete it. Three birthday bears deadlocked the whole late
  // campaign exactly this way.
  const fails = [];
  for (const g of GUESTS) {
    if (!g.allAtOnce) continue;
    if (g.dishes > BASE_KIT.carry)
      fails.push(`${g.name} wants ${g.dishes} at once but the starting tray holds ${BASE_KIT.carry}`);
  }
  assert.deepEqual(fails, []);
});

test("every party fits at every table it could be sent to", () => {
  const fails = [];
  const biggest = Math.max(...GUESTS.map((g) => g.seats));
  if (biggest > 3) fails.push(`a party of ${biggest} but tables seat 3`);
  SHIFTS.forEach((s, i) => {
    for (const t of s.types)
      if (!GUEST[t]) fails.push(`${i + 1}. ${s.name}: unknown guest ${t}`);
  });
  assert.deepEqual(fails, []);
});

test("the room is inside the room", () => {
  const fails = [];
  for (const [i, p] of SPOTS.entries()) {
    if (p.x - 58 < 0 || p.x + 58 > FIELD.w) fails.push(`table spot ${i} runs off the side`);
    if (p.y - 40 < 175 || p.y + 56 > FIELD.h) fails.push(`table spot ${i} is off the floor`);
  }
  // Matches the tap zone render.js builds: 42 wide, 58 tall, centred on the slot.
  const QW = 21, QH = 30;
  for (const [i, q] of QUEUE_SLOTS.entries()) {
    if (q.x - QW < 0 || q.x + QW > DOOR.x + DOOR.w) fails.push(`queue slot ${i} is outside the doorway`);
    if (q.y + QH > FIELD.h) fails.push(`queue slot ${i} runs off the bottom`);
    if (q.y < DOOR.y - 2 || q.y > DOOR.y + DOOR.h) fails.push(`queue slot ${i} is not by the door`);
  }
  for (let i = 0; i < QUEUE_SLOTS.length; i++)
    for (let j = i + 1; j < QUEUE_SLOTS.length; j++) {
      const a = QUEUE_SLOTS[i], b = QUEUE_SLOTS[j];
      if (Math.abs(a.x - b.x) < QW * 2 && Math.abs(a.y - b.y) < QH * 2)
        fails.push(`queue slots ${i} and ${j} overlap — that tap has no right answer`);
    }
  if (PASS.x0 + PASS.step * (PASS.slots - 1) + 16 > FIELD.w) fails.push("the pass runs off the counter");
  // Two tables must never overlap, or a tap is ambiguous.
  for (let i = 0; i < SPOTS.length; i++)
    for (let j = i + 1; j < SPOTS.length; j++)
      if (Math.hypot(SPOTS[i].x - SPOTS[j].x, SPOTS[i].y - SPOTS[j].y) < 116)
        fails.push(`table spots ${i} and ${j} overlap`);

  // ...and no table may overlap somebody standing at the door. This one only
  // showed up at a phone width with the whole shop bought, which is exactly the
  // combination nobody checks by hand.
  for (const [i, p] of SPOTS.entries())
    for (const [k, q] of QUEUE_SLOTS.entries())
      if (Math.abs(p.x - q.x) < 58 + QW && Math.abs(p.y - q.y) < 48 + QH)
        fails.push(`table spot ${i} overlaps queue slot ${k} — that tap has no right answer`);
  assert.deepEqual(fails, []);
});

test("the queue can never be longer than there are places to stand", () => {
  // The renderer clamps to the last slot, so a bigger podium than there are
  // slots would silently stack guests on top of each other.
  const maxQueue = upgradeLoadout({
    upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, u.costs.length])),
  }).queue;
  assert.ok(maxQueue <= QUEUE_SLOTS.length,
    `a full podium holds ${maxQueue} guests but there are only ${QUEUE_SLOTS.length} places at the door`);
});

test("every week has four shifts, ends on a Big Day, and the tables only ever grow", () => {
  const fails = [];
  WEEKS.forEach((w, wi) => {
    const rows = SHIFTS.map((s, i) => [s, i]).filter(([s]) => s.week === wi);
    if (rows.length !== 4) fails.push(`${w.name}: ${rows.length} shifts, expected 4`);
    if (!rows[rows.length - 1][0].big) fails.push(`${w.name} does not end on a Big Day`);
  });
  for (let i = 1; i < SHIFTS.length; i++) {
    const a = ROOMS[SHIFTS[i - 1].room].spots.length, b = ROOMS[SHIFTS[i].room].spots.length;
    if (b < a) fails.push(`${SHIFTS[i].name}: the room shrank from ${a} tables to ${b}`);
    for (const d of SHIFTS[i - 1].dishes)
      if (!SHIFTS[i].dishes.includes(d)) fails.push(`${SHIFTS[i].name}: ${d} came off the menu`);
  }
  assert.deepEqual(fails, []);
});

test("every room's cloths are real colours, one per table", () => {
  const fails = [];
  for (const r of ROOMS) {
    if (r.cloths.length !== r.spots.length) fails.push(`${r.name}: ${r.cloths.length} cloths for ${r.spots.length} tables`);
    for (const c of r.cloths) if (!CLOTH[c]) fails.push(`${r.name}: unknown cloth ${c}`);
  }
  // The five have a JOB — colour-matching is a scoring rule — so they must be
  // properly distinct, not five shades of the same thing.
  const rgb = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  for (let i = 0; i < CLOTHS.length; i++)
    for (let j = i + 1; j < CLOTHS.length; j++) {
      const a = rgb(CLOTHS[i].hex), b = rgb(CLOTHS[j].hex);
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (d < 90) fails.push(`${CLOTHS[i].id} and ${CLOTHS[j].id} are too close to tell apart (${d.toFixed(0)})`);
    }
  assert.deepEqual(fails, []);
});

test("the campaign tightens: the last week demands more of its own ceiling", () => {
  // Difficulty is not "the target goes up" — later shifts are longer, so the raw
  // number rising proves nothing. What has to rise is the share of a good run
  // the target asks for, and tests/calibrate.js is what sets it.
  const share = SHIFTS.map((s) => s.target / s.count);
  const early = share.slice(0, 4).reduce((a, b) => a + b, 0) / 4;
  const late = share.slice(-4).reduce((a, b) => a + b, 0) / 4;
  assert.ok(late > early * 1.15,
    `a shift asks ${early.toFixed(0)} points per party early and ${late.toFixed(0)} late — the campaign does not tighten`);
});

test("the shop climbs, changes something, and is affordable", () => {
  const fails = [];
  for (const u of UPGRADES) {
    if (!u.costs.length) fails.push(`${u.id}: nothing to buy`);
    for (let i = 1; i < u.costs.length; i++)
      if (u.costs[i] <= u.costs[i - 1]) fails.push(`${u.id}: level ${i + 1} is not dearer than level ${i}`);
    const maxed = upgradeLoadout({ upgrades: { [u.id]: u.costs.length } });
    if (JSON.stringify(maxed) === JSON.stringify(upgradeLoadout({}))) fails.push(`${u.id}: buying it changes nothing`);
  }
  if (new Set(UPGRADES.map((u) => u.id)).size !== UPGRADES.length) fails.push("two upgrades share an id");
  if (new Set(TRIMS.map((t) => t.id)).size !== TRIMS.length) fails.push("two trims share an id");
  assert.deepEqual(fails, []);

  const shelf = UPGRADES.reduce((a, u) => a + u.costs.reduce((x, y) => x + y, 0), 0)
    + TRIMS.reduce((a, t) => a + t.cost, 0);

  // Both bounds scale with the campaign, because a fixed number here is wrong
  // the moment the campaign changes length — this was 6000, sized for twenty
  // shifts, and doubling to forty made a perfectly good shelf fail.
  //
  // The progression bot in tests/bot.test.js measures around 430 coins a shift
  // and is the real check that the shelf is clearable. These two only rule out
  // the shapes that are obviously broken:
  //
  //   too dear  — a shelf nobody could clear by the end of the campaign
  //   too cheap — a shelf that empties halfway, which is how the back half of a
  //               forty-shift campaign ended up with a currency that did nothing
  const perShift = shelf / SHIFTS.length;
  assert.ok(perShift < 400,
    `the whole shop costs ${shelf} coins — ${perShift.toFixed(0)} a shift, more than one pays`);
  assert.ok(perShift > 180,
    `the whole shop costs only ${shelf} coins — ${perShift.toFixed(0)} a shift, so it empties long before the campaign ends`);
});

test("a happy guest pays more than a fed-up one, and nobody pays nothing", () => {
  const fails = [];
  for (const g of GUESTS) {
    const party = { type: g.id, order: ["tea"] };
    const quick = payout(party, 1).coins, slow = payout(party, 0).coins;
    if (!(quick > slow)) fails.push(`${g.name}: serving quickly pays no better (${quick} vs ${slow})`);
    if (slow <= 0) fails.push(`${g.name}: a slow serve pays nothing at all`);
  }
  assert.deepEqual(fails, []);
});

test("a shift can actually be finished — every party resolves", () => {
  // Not a balance claim: just that the engine always terminates. A party that
  // can neither be served nor time out hangs the shift forever, which is exactly
  // what three all-at-once guests used to do.
  const fails = [];
  for (const [i, s] of SHIFTS.entries()) {
    __reseed(4242 + i);
    Game.on = {};
    Game.start({ mode: "shift", shiftIdx: i, kit: upgradeLoadout({}) });
    let t = 0;
    // Nobody plays at all, so every party must leave of their own accord.
    while (Game.running && t < 2000) { Game.tick(1 / 15); t += 1 / 15; }
    if (Game.running) fails.push(`${i + 1}. ${s.name} never ended with nobody playing`);
    else if (Game.result.win) fails.push(`${i + 1}. ${s.name} was won by doing nothing`);
  }
  assert.deepEqual(fails, []);
});

/* ---------------- the week 6-10 additions ---------------- */

test("every dish has a bench that makes it, and every bench makes something", () => {
  const fails = [];
  for (const d of DISHES) {
    const st = STATION[d.station];
    if (!st) { fails.push(`${d.id}: no bench called ${d.station}`); continue; }
    const makes = Array.isArray(st.makes) ? st.makes : [st.makes];
    if (!makes.includes(d.id)) fails.push(`${d.id}: the ${st.name} does not list it`);
  }
  for (const st of STATIONS) {
    const makes = Array.isArray(st.makes) ? st.makes : [st.makes];
    for (const m of makes) if (!DISH[m]) fails.push(`${st.name}: makes unknown dish ${m}`);
  }
  // A dish on today's menu with no bench on today's dock is an order that can
  // never be filled, which the party-resolution test would only catch by hanging.
  for (const s of SHIFTS) {
    const benches = new Set(STATIONS
      .filter((st) => (Array.isArray(st.makes) ? st.makes : [st.makes]).some((m) => s.dishes.includes(m)))
      .map((st) => st.id));
    for (const d of s.dishes)
      if (!benches.has(DISH[d].station)) fails.push(`${s.name}: ${d} is on the menu with no bench for it`);
  }
  assert.deepEqual(fails, []);
});

test("every guest type earns its keep — each one turns up somewhere", () => {
  const used = new Set(SHIFTS.flatMap((s) => s.types).concat(RUSH.types));
  const orphans = GUESTS.filter((g) => !used.has(g.id)).map((g) => g.name);
  assert.deepEqual(orphans, [],
    `these types exist but never walk through a door: ${orphans.join(", ")}`);
});

test("the shy one can always be sat next to somebody", () => {
  // He drains fast with no occupied table beside him, so a room where some table
  // has NO neighbour at all is a seat that cannot be made right for him however
  // well she plays. Derived from the geometry, not from a hand-kept list.
  const fails = [];
  const shyShifts = SHIFTS.filter((s) => s.types.includes("shy"))
    .concat(RUSH.types.includes("shy") ? [{ name: "The Saturday Rush", room: RUSH.room }] : []);
  for (const s of shyShifts) {
    const spots = ROOMS[s.room].spots;
    for (const a of spots) {
      const near = spots.filter((b) => b !== a &&
        Math.hypot(SPOTS[a].x - SPOTS[b].x, SPOTS[a].y - SPOTS[b].y) <= 170);
      if (!near.length) fails.push(`${s.name}: table ${a} has no neighbour, so the deer can never be happy there`);
    }
  }
  assert.deepEqual(fails, []);
});

test("a second round is exactly one more round, and it gets paid for", () => {
  // The guard is a single flag on the table, so the failure mode to rule out is
  // an endless diner: eat, order, eat, order, never reaching the bill.
  const g = GUEST.seconds;
  assert.ok(g && g.seconds, "the seconds guest is gone");

  const rounds = [];
  let guard = 0;
  __reseed(4242);
  const idx = SHIFTS.findIndex((s) => s.types.includes("seconds"));
  assert.ok(idx >= 0, "nobody ever orders a second round");

  Game.start({ mode: "shift", shiftIdx: idx, kit: upgradeLoadout({}) });
  const seen = new Map();
  while (Game.running && guard++ < 60000) {
    Game.tick(1 / 30);
    for (const t of Game.tables) {
      if (!t.party || GUEST[t.party.type].id !== "seconds") continue;
      const n = (t.party.eaten || []).length;
      const prev = seen.get(t.party.id) || 0;
      if (n > prev) { seen.set(t.party.id, n); rounds.push(n); }
    }
  }
  assert.ok(guard < 60000, "a shift with second helpings in it never finished");
  assert.ok(rounds.every((n) => n <= 1),
    `somebody went round more than twice: ${rounds.filter((n) => n > 1).length} times`);

  // And the money: two rounds must be worth more than one of the same dish.
  const one = payout({ type: "seconds", order: ["tea"] }, 1).coins;
  const two = payout({ type: "seconds", order: ["tea"], eaten: ["tea"] }, 1).coins;
  assert.ok(two > one, `a second round paid ${two} against ${one} for one — it is not being counted`);
});
