// Cookie Crumble — what a cookie IS: the cutters, the icings, the bake, the price.
//
// One TRAY is one ORDER. That is the single decision the whole game rests on:
// a customer's card and a tray in your hands are the same kind of object, so
// "does this match?" is a three-field comparison a seven-year-old can do by
// looking, and the pipeline never has to count individual biscuits.
//
// A tray is { shape, icing, sprinkles, bakeT, bake } where `bake` is the phase
// name derived from `bakeT` by bakePhase() below. Nothing else in the game
// stores a quality — it is always re-derived from the seconds actually spent in
// the oven, so the renderer's gauge and the engine's verdict cannot disagree.

/* ---------------- cutters ---------------- */

// `bake` is a multiplier on OVEN_BASE, not a time. Thin shapes cook quicker, so
// two trays in two slots finish at different moments and the second oven becomes
// something to manage rather than just twice the throughput.
const SHAPES = [
  { id: "round",  name: "Round",   icon: "🍪", bake: 1.00, price: 8,  colour: "#d99a52" },
  { id: "star",   name: "Star",    icon: "⭐", bake: 1.00, price: 10, colour: "#e0a95c" },
  { id: "heart",  name: "Heart",   icon: "💗", bake: 0.88, price: 12, colour: "#dd9560" },
  { id: "flower", name: "Flower",  icon: "🌼", bake: 1.12, price: 14, colour: "#e2ad63" },
  { id: "moon",   name: "Moon",    icon: "🌙", bake: 0.84, price: 13, colour: "#d9a15a" },
  { id: "tree",   name: "Tree",    icon: "🎄", bake: 1.22, price: 16, colour: "#cf9750" },
];

const SHAPE = Object.fromEntries(SHAPES.map((s) => [s.id, s]));

/* ---------------- icings ---------------- */

// "none" is a real icing, not the absence of one. An order for a plain cookie
// must be filled with a tray that never visited the icing table, which is what
// lets the first week be a complete game with the table switched off.
const ICINGS = [
  { id: "none",   name: "Plain",     swatch: "#e8c48d", mult: 1.00 },
  { id: "pink",   name: "Pink",      swatch: "#ff8fbf", mult: 1.25 },
  { id: "blue",   name: "Blue",      swatch: "#7fc4ff", mult: 1.25 },
  { id: "yellow", name: "Lemon",     swatch: "#ffd84d", mult: 1.25 },
  { id: "green",  name: "Mint",      swatch: "#86dd8f", mult: 1.30 },
  { id: "choc",   name: "Chocolate", swatch: "#8a5a34", mult: 1.35 },
];

const ICING = Object.fromEntries(ICINGS.map((i) => [i.id, i]));

const SPRINKLE_MULT = 1.2;

/* ---------------- the oven ---------------- */

// Seconds, at the base timer. `perfect` is the window you are aiming for and
// `crisp` is the amber tail after it — a graded penalty rather than a cliff, so
// being a second late costs money instead of the whole tray. Nothing is lost
// until `burnt`, and a tray pulled EARLY can go straight back in (game.js keeps
// bakeT), which is why there is no under-baked failure state at all.
// The perfect window started at 3 seconds wide and the bots reported every bot,
// including the sloppiest, baking 100% perfect on every shift in the game — the
// core verb was free, and the third star was really only measuring lost
// customers. A window has to be narrow enough that being somewhere else when it
// opens is the normal outcome, which is what makes the second oven, the timer
// and the cooling rack worth coins.
const OVEN = {
  base: 5.0,        // seconds to the start of the perfect window, × shape.bake
  perfect: 1.4,     // width of the perfect window, widened by the Kitchen Timer
  crisp: 3.2,       // the amber tail after perfect; past it the tray is burnt
};

// Elapsed oven seconds -> phase. `timer` is the upgrade bonus on the window.
function bakePhase(shape, t, timer = 0) {
  const start = OVEN.base * SHAPE[shape].bake;
  const perfectEnd = start + OVEN.perfect + timer;
  if (t < start) return "raw";
  if (t < perfectEnd) return "perfect";
  if (t < perfectEnd + OVEN.crisp) return "crisp";
  return "burnt";
}

// The four boundaries, for the gauge and for a bot deciding when to open the
// door. Both read the same function, so a green band drawn on screen is exactly
// the band the engine will accept.
function bakeBands(shape, timer = 0) {
  const start = OVEN.base * SHAPE[shape].bake;
  return {
    start,
    perfectEnd: start + OVEN.perfect + timer,
    crispEnd: start + OVEN.perfect + timer + OVEN.crisp,
  };
}

const BAKE_PAY = { perfect: 1.0, crisp: 0.55, raw: 0, burnt: 0 };

/* ---------------- money ---------------- */

// What a matching tray is worth. `patienceFrac` is how much of the customer's
// patience is LEFT, so hurrying pays a tip and dawdling merely pays less — a
// bonus rather than a punishment, which keeps the clock out of the star grades.
function payFor(tray, patienceFrac = 0) {
  const base = SHAPE[tray.shape].price
    * ICING[tray.icing].mult
    * (tray.sprinkles ? SPRINKLE_MULT : 1)
    * BAKE_PAY[tray.bake];
  const tip = base * 0.25 * Math.max(0, patienceFrac);
  return { coins: Math.round(base + tip), tip: Math.round(tip) };
}

// The most a single order in this shift could ever be worth, used to scale the
// results screen rather than to grade anything.
function bestPay(shift) {
  let best = 0;
  for (const s of shift.shapes)
    for (const i of shift.icings) {
      const t = { shape: s, icing: i, sprinkles: !!shift.sprinkles, bake: "perfect" };
      best = Math.max(best, payFor(t, 1).coins);
    }
  return best;
}

/* ---------------- orders ---------------- */

function sameOrder(a, b) {
  return a.shape === b.shape && a.icing === b.icing && !!a.sprinkles === !!b.sprinkles;
}

// A tray fills an order if it matches AND came out of the oven edible. Burnt and
// raw trays are refused by everybody — that is the only thing the bake phase
// gates, since crisp still sells.
function trayFills(tray, order) {
  if (!tray || !order) return false;
  if (tray.bake !== "perfect" && tray.bake !== "crisp") return false;
  return sameOrder(tray, order);
}

// Deal the whole shift's orders up front from a shuffled bag of every legal
// combination, so every cutter and every icing the shift hands out is actually
// asked for before any of them is asked for twice. Dealing per-arrival instead
// lets a random run never use the new colour it just introduced.
function dealOrders(shift, rand = Math.random) {
  const combos = [];
  for (const shape of shift.shapes)
    for (const icing of shift.icings) {
      combos.push({ shape, icing, sprinkles: false });
      if (shift.sprinkles) combos.push({ shape, icing, sprinkles: true });
    }

  const out = [];
  let bag = [];
  for (let i = 0; i < shift.count; i++) {
    if (!bag.length) {
      bag = combos.slice();
      for (let j = bag.length - 1; j > 0; j--) {
        const k = Math.floor(rand() * (j + 1));
        [bag[j], bag[k]] = [bag[k], bag[j]];
      }
    }
    out.push({ ...bag.pop() });
  }
  return out;
}

// How long one order takes a faultless baker with nothing else to do: mixing,
// cutting, the bake to the middle of its window, and icing. shifts.js sizes
// patience off this, and the linter checks the schedule against it — so a shift
// cannot be authored that asks for a cookie quicker than one can be made.
function orderSeconds(order, kit = {}) {
  const b = bakeBands(order.shape, kit.timer || 0);
  return (kit.mix != null ? kit.mix : STATION.mix)
    + STATION.cut
    + (b.start + b.perfectEnd) / 2
    + (order.icing === "none" && !order.sprinkles ? 0 : STATION.ice)
    + STATION.taps;
}

// Everything that is not the oven. `taps` is a small allowance for the carrying
// taps themselves, so orderSeconds() stays honest about a real hand.
const STATION = {
  mix: 2.2,
  cut: 0.8,
  ice: 0.5,
  taps: 0.9,
};

if (typeof module !== "undefined") module.exports = {};
