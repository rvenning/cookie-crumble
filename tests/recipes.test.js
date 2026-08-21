// Cookie Crumble — content.
//
// The fairness promise of the whole game is one sentence: every card a customer
// holds up can be made with what this morning's shopping brought in. It is
// designed out rather than tested for — a shift's orders are dealt from its own
// `shapes` × `icings` — but the linter says so out loud, because the day
// somebody adds a "special order" the guarantee is the first thing to break.
//
// Failures are collected and asserted as a list, so one run names every offender
// rather than stopping at the first.

const test = require("node:test");
const assert = require("node:assert");
const { load } = require("./load.js");

const S = load();
const {
  SHAPES, SHAPE, ICINGS, ICING, OVEN, SHIFTS, WEEKS, RUSH, UPGRADES, TRIMS,
  bakePhase, bakeBands, payFor, dealOrders, trayFills, demandSeconds,
  upgradeLoadout, BASE_KIT, __reseed,
} = S;

const SEEDS = [11, 97, 404, 1234, 5150, 8080];

test("every order a customer asks for can be made from today's shopping", () => {
  const fails = [];
  for (const [i, s] of SHIFTS.entries()) {
    for (const seed of SEEDS) {
      __reseed(seed);
      for (const o of dealOrders(s, Math.random)) {
        const where = `${i + 1}. ${s.name} (seed ${seed})`;
        if (!s.shapes.includes(o.shape)) fails.push(`${where}: no ${o.shape} cutter today`);
        if (!s.icings.includes(o.icing)) fails.push(`${where}: no ${o.icing} icing today`);
        if (o.sprinkles && !s.sprinkles) fails.push(`${where}: sprinkles asked for, none in the shop`);
      }
    }
  }
  assert.deepEqual(fails, []);
});

test("The Big Rush only ever rolls orders it has the ingredients for", () => {
  const G = S.Game;
  const fails = [];
  __reseed(5);
  G.on = {};
  G.start({ mode: "rush" });
  for (let i = 0; i < 4000; i++) {
    const o = G.rollOrder();
    if (!RUSH.shapes.includes(o.shape)) fails.push(`rush: ${o.shape}`);
    if (!RUSH.icings.includes(o.icing)) fails.push(`rush: ${o.icing}`);
  }
  G.abandon();
  assert.deepEqual([...new Set(fails)], []);
});

test("the shop's cutters and icings are real, and every one of them gets used", () => {
  const fails = [];
  const seenShape = new Set(), seenIcing = new Set();
  for (const [i, s] of SHIFTS.entries()) {
    for (const sh of s.shapes) {
      if (!SHAPE[sh]) fails.push(`${i + 1}. ${s.name}: unknown cutter ${sh}`);
      seenShape.add(sh);
    }
    for (const ic of s.icings) {
      if (!ICING[ic]) fails.push(`${i + 1}. ${s.name}: unknown icing ${ic}`);
      seenIcing.add(ic);
    }
  }
  for (const sh of SHAPES) if (!seenShape.has(sh.id)) fails.push(`cutter ${sh.id} is never used`);
  for (const ic of ICINGS) if (!seenIcing.has(ic.id)) fails.push(`icing ${ic.id} is never used`);
  assert.deepEqual(fails, []);
});

test("ingredients only ever arrive, never disappear", () => {
  // A week can add cutters and colours; it must never take one away, or a child
  // who learned a shape last week finds it gone with no explanation.
  const fails = [];
  for (let i = 1; i < SHIFTS.length; i++) {
    const prev = SHIFTS[i - 1], cur = SHIFTS[i];
    if (prev.week !== cur.week) continue;
    for (const sh of prev.shapes) if (!cur.shapes.includes(sh)) fails.push(`${cur.name}: lost the ${sh} cutter`);
    for (const ic of prev.icings) if (!cur.icings.includes(ic)) fails.push(`${cur.name}: lost ${ic} icing`);
    if (prev.sprinkles && !cur.sprinkles) fails.push(`${cur.name}: lost the sprinkles`);
  }
  assert.deepEqual(fails, []);
});

test("a week gets harder as it goes, and ends on a Big Day", () => {
  const fails = [];
  for (const [w, week] of WEEKS.entries()) {
    const rows = SHIFTS.map((s, i) => [s, i]).filter(([s]) => s.week === w);
    if (rows.length !== 4) fails.push(`${week.name}: ${rows.length} shifts, expected 4`);
    if (!rows[rows.length - 1][0].big) fails.push(`${week.name} does not end on a Big Day`);
    for (let k = 1; k < rows.length; k++) {
      const [a] = rows[k - 1], [b] = rows[k];
      // Pressure is `demandSeconds` — how long the person at the back of the
      // queue will wait for their tray — not the raw patience number, which
      // falls across the campaign while the counter gets deeper.
      if (demandSeconds(b) > demandSeconds(a) + 1e-9)
        fails.push(`${week.name}: ${b.name} is easier than ${a.name} (${demandSeconds(b).toFixed(1)}s vs ${demandSeconds(a).toFixed(1)}s)`);
      if (b.count < a.count) fails.push(`${week.name}: ${b.name} has fewer customers than ${a.name}`);
    }
  }
  // ...and the campaign as a whole tightens: the Bake-Off must demand more of
  // the kitchen than opening day did.
  if (demandSeconds(SHIFTS[SHIFTS.length - 1]) >= demandSeconds(SHIFTS[0]))
    fails.push("the last shift is no harder than the first");
  assert.deepEqual(fails, []);
});

test("the oven gauge the player sees is the window the engine grades", () => {
  // bakePhase() and bakeBands() are the only two descriptions of the oven, and
  // render.js draws from one while game.js judges with the other. Walk every
  // shape at every timer level across both boundaries.
  const fails = [];
  const eps = 1e-6;
  for (const sh of SHAPES) {
    for (const timer of [0, 0.6, 1.2, 1.8]) {
      const b = bakeBands(sh.id, timer);
      const at = (t) => bakePhase(sh.id, t, timer);
      const want = [
        [b.start - eps, "raw"], [b.start + eps, "perfect"],
        [b.perfectEnd - eps, "perfect"], [b.perfectEnd + eps, "crisp"],
        [b.crispEnd - eps, "crisp"], [b.crispEnd + eps, "burnt"],
      ];
      for (const [t, exp] of want)
        if (at(t) !== exp) fails.push(`${sh.id} timer+${timer}: t=${t.toFixed(4)} is ${at(t)}, gauge says ${exp}`);
      if (!(b.start < b.perfectEnd && b.perfectEnd < b.crispEnd))
        fails.push(`${sh.id} timer+${timer}: bands out of order`);
    }
  }
  assert.deepEqual(fails, []);

  // The Kitchen Timer has to widen the window and nothing else — moving `start`
  // would silently retune every shape's bake time along with it.
  for (const sh of SHAPES) {
    assert.equal(bakeBands(sh.id, 0).start, bakeBands(sh.id, 1.8).start, `${sh.id}: the timer moved the bake time`);
    assert.ok(bakeBands(sh.id, 1.8).perfectEnd > bakeBands(sh.id, 0).perfectEnd, `${sh.id}: the timer buys nothing`);
  }
});

test("a burnt tray is worth nothing and nobody will take it", () => {
  const fails = [];
  for (const sh of SHAPES) {
    for (const ic of ICINGS) {
      const mk = (bake, sprinkles = false) => ({ shape: sh.id, icing: ic.id, sprinkles, bake });
      const order = { shape: sh.id, icing: ic.id, sprinkles: false };
      if (trayFills(mk("burnt"), order)) fails.push(`${sh.id}/${ic.id}: a burnt tray was accepted`);
      if (trayFills(mk("raw"), order)) fails.push(`${sh.id}/${ic.id}: a raw tray was accepted`);
      if (!trayFills(mk("perfect"), order)) fails.push(`${sh.id}/${ic.id}: a perfect tray was refused`);
      if (!trayFills(mk("crisp"), order)) fails.push(`${sh.id}/${ic.id}: a crisp tray was refused`);
      if (trayFills(mk("perfect", true), order)) fails.push(`${sh.id}/${ic.id}: sprinkles nobody asked for were accepted`);

      if (payFor(mk("burnt"), 1).coins !== 0) fails.push(`${sh.id}/${ic.id}: burnt pays`);
      const p = payFor(mk("perfect"), 0).coins, c = payFor(mk("crisp"), 0).coins;
      if (!(p > c && c > 0)) fails.push(`${sh.id}/${ic.id}: perfect ${p} vs crisp ${c} — the bake does not pay`);
      // Hurrying is a bonus, never a penalty: the tip only ever adds.
      if (payFor(mk("perfect"), 1).coins < p) fails.push(`${sh.id}/${ic.id}: serving fast pays less`);
    }
  }
  assert.deepEqual(fails, []);

  // Fancier cookies are worth more, or the whole shop is decoration.
  assert.ok(payFor({ shape: "tree", icing: "choc", sprinkles: true, bake: "perfect" }, 0).coins
    > payFor({ shape: "round", icing: "none", sprinkles: false, bake: "perfect" }, 0).coins * 2,
    "the fanciest cookie in the shop is not worth twice the plainest");
});

test("the Corner Shop's prices climb, and every item on the shelf does something", () => {
  const fails = [];
  for (const u of UPGRADES) {
    if (!u.costs.length) fails.push(`${u.id}: nothing to buy`);
    for (let i = 1; i < u.costs.length; i++)
      if (u.costs[i] <= u.costs[i - 1]) fails.push(`${u.id}: level ${i + 1} is not dearer than level ${i}`);

    // The kitchen at level 0 and the kitchen at max must actually differ, or an
    // upgrade is being sold that upgradeLoadout never reads.
    const maxed = upgradeLoadout({ upgrades: { [u.id]: u.costs.length } });
    const bare = upgradeLoadout({});
    if (JSON.stringify(maxed) === JSON.stringify(bare)) fails.push(`${u.id}: buying it changes nothing`);
  }
  const ids = new Set(UPGRADES.map((u) => u.id));
  if (ids.size !== UPGRADES.length) fails.push("two upgrades share an id");
  const trimIds = new Set(TRIMS.map((t) => t.id));
  if (trimIds.size !== TRIMS.length) fails.push("two trims share an id");
  assert.deepEqual(fails, []);

  // Everything on the shelf, all at once, has to be reachable: the campaign has
  // to pay out more than the shop asks for, or the last upgrade is a museum
  // piece. (tests/bot.test.js measures what it actually pays.)
  const shelf = UPGRADES.reduce((a, u) => a + u.costs.reduce((x, y) => x + y, 0), 0)
    + TRIMS.reduce((a, t) => a + t.cost, 0);
  assert.ok(shelf < 3400, `the shop costs ${shelf} coins and a full campaign pays about 3900`);
});

test("the starting kitchen is the one the shifts were tuned against", () => {
  const bare = upgradeLoadout({});
  assert.deepEqual(bare, {
    mix: BASE_KIT.mix, ovens: 1, rack: 1, timer: 0, patience: 0, scraper: 0,
  }, "the kitchen a new player starts with moved — re-run the balance bots");
  assert.ok(OVEN.perfect < 2, "the perfect window is wide enough to be free again");
});
