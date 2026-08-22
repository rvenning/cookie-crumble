// Cookie Crumble — what's on the menu, and who walks through the door.
//
// The whole game is a scheduling problem, so everything here is deliberately
// thin: a dish is a name and a station, a guest type is four numbers and a flag.
// Depth is supposed to come from six of these interacting on a floor, never from
// any one of them being clever.

/* ---------------- the five tablecloths ---------------- */

// These are a MECHANIC, not decoration: a party arrives tagged with a colour and
// seating it on the matching cloth pays a bonus. So they have a hard constraint
// the rest of the palette doesn't — five hues that stay apart from each other at
// thumbnail size, all carrying the same pale lettering.
// Measured pairwise, not chosen by eye: the first pass had teal and sky 57 apart
// in RGB and plum and sky 80, which is fine on a swatch card and useless on a
// tablecloth at arm's length. Every pair is now at least 90 apart.
const CLOTHS = [
  { id: "rose", hex: "#d9576f" },
  { id: "leaf", hex: "#3f9e56" },
  { id: "gold", hex: "#c98d15" },
  { id: "plum", hex: "#7048a8" },
  { id: "sky",  hex: "#1f9bd1" },
];
const CLOTH = Object.fromEntries(CLOTHS.map((c) => [c.id, c]));

/* ---------------- dishes ---------------- */

// A plate at the pass is a dish TYPE, not a plate for a particular table.
// Anything that ordered tea can take any tea. That one decision is what makes
// collecting worth thinking about — when two tables want cake and one cake is
// ready, you have to choose, and choosing is the game.
const DISHES = [
  { id: "tea",      name: "Tea",      station: "urn",     price: 8,  icon: "tea" },
  { id: "scone",    name: "Scone",    station: "oven",    price: 11, icon: "scone" },
  { id: "cookie",   name: "Cookie",   station: "oven",    price: 10, icon: "cookie" },
  { id: "cake",     name: "Cake",     station: "icing",   price: 15, icon: "cake" },
  // Week 6. The oven is the bottleneck by then because it makes two of the four
  // things on the menu; a fifth dish on a bench of its own is the one addition
  // that adds capacity and pressure at the same time.
  { id: "sandwich", name: "Sandwich", station: "counter", price: 13, icon: "sandwich" },
];
const DISH = Object.fromEntries(DISHES.map((d) => [d.id, d]));

// Three stations, and they run WITHOUT you. That is the point of them: they turn
// the quiet second after a serve into a decision about what to put on next,
// rather than dead air.
const STATIONS = [
  { id: "urn",     name: "Urn",     makes: "tea",               base: 3.0, icon: "🫖" },
  { id: "oven",    name: "Oven",    makes: ["scone", "cookie"], base: 4.5, icon: "🔥" },
  { id: "icing",   name: "Icing",   makes: "cake",              base: 4.0, icon: "🎂" },
  { id: "counter", name: "Counter", makes: "sandwich",          base: 3.6, icon: "🥪" },
];
const STATION = Object.fromEntries(STATIONS.map((s) => [s.id, s]));

function stationFor(dishId) { return DISH[dishId].station; }

/* ---------------- how long each job takes ---------------- */

// Seconds spent standing at the thing once you've walked to it. Small numbers on
// purpose — the walk is meant to dominate, because the walk is the decision.
//
// There are FOUR jobs per party, not six, and that is a tuning decision the bots
// forced. Seating costs no walk (you wave them over from wherever you are) and
// settling up happens as you clear the table. At six jobs a party cost ~12s of
// server time against a 9s arrival gap, so every queue grew without bound and
// the planner lost every shift from about number three onward.
const JOB = {
  seat: 0.5,         // no walk — they see you point and take themselves over
  order: 0.75,
  collect: 0.3,      // per plate
  serve: 0.5,
  clear: 1.2,        // and this is when they settle up
  eat: 6.0,          // how long a party sits with its food
};

/* ---------------- guests ---------------- */

// Each type breaks the routine in exactly ONE way. That is the whole design
// rule: if a type needs two sentences to explain, it is two types.
//
//   patience   seconds of goodwill at full hearts
//   drain      multiplier on how fast that runs down
//   tip        multiplier on what they pay
//   seats      how many chairs they need
//   dishes     how many things they order
const GUESTS = [
  {
    id: "regular", name: "Regular", animal: "rabbit",
    patience: 1.0, drain: 1.0, tip: 1.0, seats: 1, dishes: 1,
    blurb: "Comes in most days, never in a hurry, always says thank you.",
    breaks: "nothing — this is the baseline",
  },
  {
    id: "commuter", name: "Commuter", animal: "fox",
    patience: 0.58, drain: 1.35, tip: 2.0, seats: 1, dishes: 1,
    blurb: "Has four minutes and knows it. Tips like someone who feels guilty.",
    breaks: "your ordering — serve them first, always",
  },
  {
    id: "twins", name: "The Nutkin twins", animal: "squirrel",
    patience: 1.1, drain: 1.0, tip: 1.0, seats: 2, dishes: 2,
    slowOrder: 1.6, messy: true,
    blurb: "Take an age to decide and leave crumbs from here to the door.",
    breaks: "placement — their table needs clearing twice",
  },
  {
    id: "friends", name: "Old friends", animal: "badger",
    patience: 2.2, drain: 0.55, tip: 0.85, seats: 2, dishes: 2, linger: 2.4,
    blurb: "In absolutely no hurry. Will still be here when you close.",
    breaks: "table economy — they hold a table forever",
  },
  {
    id: "prickle", name: "Prickle", animal: "hedge",
    patience: 1.0, drain: 1.0, tip: 1.2, seats: 1, dishes: 1, prickly: true,
    blurb: "Doesn't care for company. Sits alone or nobody has a nice time.",
    breaks: "adjacency — neighbours lose patience twice as fast",
  },
  {
    id: "birthday", name: "Birthday bear", animal: "bear",
    // TWO dishes, not three. `allAtOnce` plus three dishes against a starting
    // tray that holds two is an unservable guest: she fills both hands, cannot
    // serve, and cannot free a hand to fetch the third. It deadlocked the whole
    // late campaign. Any all-at-once order must fit in the BASE tray.
    patience: 1.3, drain: 1.0, tip: 1.6, seats: 3, dishes: 2, allAtOnce: true,
    blurb: "It's his birthday. Everything has to arrive at the same time.",
    breaks: "batching — you cannot serve him in two trips",
  },
  {
    id: "inspector", name: "The inspector", animal: "owl",
    patience: 1.15, drain: 1.0, tip: 1.0, seats: 1, dishes: 2, mustPlease: true,
    blurb: "Writes things down. Doesn't say what.",
    breaks: "complacency — lose her and you lose the shift",
  },
  {
    id: "tiny", name: "The tiny one", animal: "mouse",
    patience: 1.5, drain: 0.9, tip: 0.6, seats: 1, dishes: 1, escort: true,
    blurb: "Can't reach the counter. Has to be walked to her table personally.",
    breaks: "nothing — she just costs you a trip, and she's worth it",
  },

  /* ---- week 6 onward. Each of these turns something that was a BONUS or a
     background rule into a constraint you have to plan around. ---- */

  {
    // The colour match was free points you could ignore. For her it is the
    // whole job: on the wrong cloth she runs down twice as fast.
    id: "picky", name: "The particular cat", animal: "cat",
    patience: 1.05, drain: 1.0, tip: 1.35, seats: 1, dishes: 1, picky: true,
    blurb: "Has a colour in mind and it is not the one you were going to give her.",
    breaks: "seating — the matching cloth stops being a bonus and starts being the point",
  },
  {
    // Prickle's mirror, and the reason they are worth having in the same shift:
    // one wants a table with nobody beside it, the other wants the opposite, and
    // the room only has so many corners.
    id: "shy", name: "The shy one", animal: "deer",
    patience: 1.2, drain: 1.0, tip: 1.05, seats: 1, dishes: 1, shy: true,
    blurb: "Doesn't want to be the only one in here. Sits happier beside somebody.",
    breaks: "adjacency, backwards — an empty neighbouring table is what upsets him",
  },
  {
    // Costs you four more jobs rather than just a table, which is what makes him
    // different from the badgers: they are slow, he is more work.
    id: "seconds", name: "Second helpings", animal: "frog",
    patience: 1.25, drain: 0.9, tip: 1.15, seats: 1, dishes: 1, seconds: true,
    blurb: "Finishes, thinks about it, and orders one more thing.",
    breaks: "turnover — that table is not free when you think it is",
  },
];
const GUEST = Object.fromEntries(GUESTS.map((g) => [g.id, g]));

/* ---------------- scoring ---------------- */

const SCORE = {
  SEAT: 20,
  MATCH: 60,          // seated on the matching cloth
  SERVE: 40,          // per dish delivered
  ONE_TRIP: 55,       // a multi-dish order laid in a single trip; double for a bear
  PERFECT: 90,        // paid up with more than half their patience left
  PAY_BASE: 70,
  // Measured: even a player hunting chains hard tops out around two or three
  // links, because four kinds of job rotate across six tables and runs of the
  // same kind are simply rare. So the step is priced for the lengths that
  // actually happen — two in a row is worth 1.6x — rather than for a five-chain
  // nobody will ever see.
  CHAIN_STEP: 0.6,
  CHAIN_MAX: 3,
};

// What a finished table is worth. `frac` is the patience they had left when they
// paid, so hurrying is a bonus rather than dawdling being a punishment.
function payout(party, frac) {
  const g = GUEST[party.type];
  // `eaten` holds earlier rounds — Second helpings pays for the lot, not just
  // for whatever he happened to be on when you cleared him.
  const all = party.eaten ? party.eaten.concat(party.order) : party.order;
  const food = all.reduce((a, d) => a + DISH[d].price, 0);
  const tip = Math.round(food * 0.45 * Math.max(0, frac) * g.tip);
  return { coins: Math.round(food * g.tip) + tip, tip };
}

if (typeof module !== "undefined") module.exports = {};
