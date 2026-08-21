// Cookie Crumble — the room, and the twenty shifts played in it.
//
// GEOMETRY IS CONTENT HERE. In a routing game the table positions are as much a
// level design as the customer schedule is, because the only thing the player
// spends is walking. Two tables in opposite corners is a harder shift than the
// same two tables side by side, with no other number changed.
//
// Everything is in one fixed logical field so every device plays the identical
// room — the leaderboard depends on that, and so does every balance number the
// bots produce.

const FIELD = { w: 360, h: 620 };

// The pass runs along the counter on the back wall. Plates land here, left to
// right, and the server stands just below the slot to pick one up.
const PASS = { y: 150, x0: 190, step: 42, standY: 196, slots: 4 };

// The door and the queue in front of it, bottom-left — the corner furthest from
// the pass, which is the whole reason seating is a real decision.
const DOOR = { x: 0, y: 424, w: 92, h: 176 };
// Two by two rather than a single file: a full podium holds four, and three
// slots meant the fourth guest was drawn stacked on top of the third.
const QUEUE_SLOTS = [
  { x: 25, y: 466 }, { x: 67, y: 466 },
  { x: 25, y: 540 }, { x: 67, y: 540 },
];

const SERVER_HOME = { x: 182, y: 212 };

// Every table position the shop can ever have. A room opens a subset.
const SPOTS = [
  { x: 108, y: 258 },
  { x: 256, y: 258 },
  { x: 98,  y: 378 },
  { x: 272, y: 378 },
  // Clear of the doorway: at x=128 this table's tap zone overlapped the second
  // column of the queue, so a tap in the corner had no right answer. A table
  // must start at least half its own width past the door.
  { x: 152, y: 502 },
  { x: 288, y: 502 },
];

// A room is which spots are open and what colour their cloths are. Cloths are
// fixed per room so a shift can hand out matching colours honestly.
const ROOMS = [
  { name: "Three tables", spots: [0, 1, 2], cloths: ["rose", "leaf", "gold"] },
  { name: "Four tables",  spots: [0, 1, 2, 3], cloths: ["rose", "leaf", "gold", "plum"] },
  { name: "Five tables",  spots: [0, 1, 2, 3, 4], cloths: ["rose", "leaf", "gold", "plum", "sky"] },
  { name: "The full room", spots: [0, 1, 2, 3, 4, 5], cloths: ["rose", "leaf", "gold", "plum", "sky", "rose"] },
];

// Tables that count as neighbours, for the guest who doesn't like company.
// Derived from the geometry rather than hand-listed, so moving a spot can't
// leave a stale adjacency behind.
const NEIGHBOUR_DIST = 170;
function neighbours(a, b) {
  const p = SPOTS[a], q = SPOTS[b];
  return Math.hypot(p.x - q.x, p.y - q.y) <= NEIGHBOUR_DIST;
}

const WEEKS = [
  { name: "Opening Week",    icon: "🫖", hue: "#ffd45e",
    blurb: "Three tables, a pot of tea and a tin of cookies." },
  { name: "The Cake Trolley", icon: "🎂", hue: "#f4a3bb",
    blurb: "Cake arrives, and so do the squirrels." },
  { name: "Table for Two",   icon: "🍰", hue: "#8fcf70",
    blurb: "A fifth table, scones, and guests with opinions." },
  { name: "Party Season",    icon: "🎈", hue: "#7fb8c9",
    blurb: "The full room, every day, and somebody's always celebrating." },
  { name: "The Inspection",  icon: "🦉", hue: "#c9975a",
    blurb: "Everything you know, and somebody taking notes." },
];

// room       which floor plan
// dishes     today's menu — orders are dealt from these
// types      which guests can turn up
// count      parties this shift
// first/gap  the arrival schedule, throttled when the queue is full
// patience   base seconds of goodwill, before the guest type's multiplier
// target     the one-star score. Two stars is x1.35, three is x1.75.
// maxLost    lose more than this and the shift is a bust
const SHIFTS = [
  /* ---- week 1 ---- */
  { name: "Opening Day", week: 0, room: 0, dishes: ["tea"], types: ["regular"],
    count: 6, first: 2.0, gap: 11.4, patience: 41, target: 970, maxLost: 2,
    tip: "Tap a guest, then a table. Then the ? , then the pass, then the table again." },
  { name: "Tea and Cookies", week: 0, room: 0, dishes: ["tea", "cookie"], types: ["regular"],
    count: 7, first: 2.0, gap: 10.4, patience: 39, target: 1110, maxLost: 2,
    tip: "Two things on the menu now. Put the oven on before anybody asks." },
  { name: "The Morning Train", week: 0, room: 0, dishes: ["tea", "cookie"], types: ["regular", "commuter"],
    count: 8, first: 2.0, gap: 9.4, patience: 37, target: 1050, maxLost: 3,
    tip: "The fox is in a hurry and tips double. Him first." },
  { name: "Saturday Opening", week: 0, big: true, room: 1, dishes: ["tea", "cookie"],
    types: ["regular", "commuter"],
    count: 10, first: 1.8, gap: 9.4, patience: 39, target: 1340, maxLost: 3,
    tip: "A fourth table. Match the cloth colour to the guest for a bonus." },

  /* ---- week 2 ---- */
  { name: "The Cake Trolley", week: 1, room: 1, dishes: ["tea", "cookie", "cake"],
    types: ["regular", "commuter"],
    count: 9, first: 2.0, gap: 9.9, patience: 39, target: 1220, maxLost: 3,
    tip: "Cake takes the longest. Start one whenever the icing bench is free." },
  { name: "Squirrel Weather", week: 1, room: 1, dishes: ["tea", "cookie", "cake"],
    types: ["regular", "commuter", "twins"],
    count: 10, first: 2.0, gap: 9.4, patience: 38, target: 1460, maxLost: 3,
    tip: "The twins leave crumbs — their table needs clearing twice." },
  { name: "Market Day", week: 1, room: 1, dishes: ["tea", "cookie", "cake"],
    types: ["regular", "commuter", "twins"],
    count: 11, first: 1.8, gap: 9.0, patience: 37, target: 1630, maxLost: 3 },
  { name: "The Village Fete", week: 1, big: true, room: 2, dishes: ["tea", "cookie", "cake"],
    types: ["regular", "commuter", "twins"],
    count: 13, first: 1.8, gap: 9.4, patience: 39, target: 2000, maxLost: 4,
    tip: "Five tables and no let-up. Keep all three benches working." },

  /* ---- week 3 ---- */
  { name: "Scones Are On", week: 2, room: 2, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins"],
    count: 11, first: 2.0, gap: 10.0, patience: 40, target: 1750, maxLost: 3,
    tip: "Four things on the menu and one oven. It can only make one at a time." },
  { name: "Old Friends", week: 2, room: 2, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "friends"],
    count: 12, first: 2.0, gap: 9.6, patience: 39, target: 2080, maxLost: 3,
    tip: "The badgers will sit all afternoon. Give them the far table." },
  { name: "A Prickly Customer", week: 2, room: 2, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "friends", "prickle"],
    count: 12, first: 1.9, gap: 9.2, patience: 38, target: 1980, maxLost: 3,
    tip: "Prickle upsets whoever sits near him. Put him somewhere on his own." },
  { name: "The Long Saturday", week: 2, big: true, room: 3, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "friends", "prickle"],
    count: 14, first: 1.8, gap: 11.9, patience: 47, target: 2730, maxLost: 4,
    tip: "Six tables at last. That's more room and a lot more walking." },

  /* ---- week 4 ---- */
  { name: "Party Season", week: 3, room: 3, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "friends", "birthday"],
    count: 12, first: 1.9, gap: 11.9, patience: 47, target: 2620, maxLost: 3,
    tip: "The bear wants everything at once — carry it all in one trip." },
  { name: "Someone Small", week: 3, room: 3, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "prickle", "birthday", "tiny"],
    count: 13, first: 1.8, gap: 11.4, patience: 46, target: 2470, maxLost: 3,
    tip: "The mouse has to be walked to her table. Worth it." },
  { name: "Rain All Day", week: 3, room: 3, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "friends", "prickle", "tiny"],
    count: 13, first: 1.8, gap: 11.0, patience: 45, target: 2730, maxLost: 3 },
  { name: "The Birthday Rush", week: 3, big: true, room: 3, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "friends", "birthday", "tiny"],
    count: 15, first: 1.7, gap: 10.6, patience: 44, target: 3160, maxLost: 4,
    tip: "Three birthdays booked in. Cake, cake and more cake." },

  /* ---- week 5 ---- */
  { name: "Word Gets Around", week: 4, room: 3, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "friends", "prickle", "birthday", "tiny"],
    count: 14, first: 1.8, gap: 11.2, patience: 45, target: 3070, maxLost: 3 },
  { name: "The Inspector Calls", week: 4, room: 3, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "friends", "birthday", "inspector"],
    count: 14, first: 1.7, gap: 10.8, patience: 44, target: 3380, maxLost: 3,
    tip: "The owl is watching. If she leaves unhappy, the day is a write-off." },
  { name: "Full House", week: 4, room: 3, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "friends", "prickle", "birthday", "tiny", "inspector"],
    count: 15, first: 1.7, gap: 10.8, patience: 45, target: 3250, maxLost: 3 },
  { name: "The Grand Re-Opening", week: 4, big: true, room: 3, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "friends", "prickle", "birthday", "tiny", "inspector"],
    count: 16, first: 1.6, gap: 10.8, patience: 45, target: 3460, maxLost: 4,
    tip: "Everybody, all at once. This is the one." },
];

const STAR_MULT = [1.0, 1.35, 1.75];

/* ---------------- The Saturday Rush ---------------- */

// The leaderboard mode. Everyone plays it on the same fixed kitchen, so the shop
// can never buy a place on the board, and patience decays with every party
// resolved and never levels off — a floor would make it survivable forever and
// there would be no score to compare.
const RUSH = {
  room: 3,
  dishes: ["tea", "cookie", "cake", "scone"],
  types: ["regular", "commuter", "twins", "friends", "prickle", "birthday", "tiny"],
  first: 1.5, gap: 9.5,
  patienceStart: 58, patienceDecay: 0.991,
  mistakes: 3,
  kit: { walk: 150, carry: 2, queue: 3, patience: 0, urn: 1, oven: 1, icing: 1, clear: 1 },
};

const RUSH_UNLOCK_SHIFTS = 6;

function shiftsInWeek(w) {
  return SHIFTS.map((s, i) => [s, i]).filter(([s]) => s.week === w);
}

// The shape of a shift's demand, for the content linter: parties per minute
// against the number of tables they have to pass through.
function pressure(s) {
  return (60 / s.gap) / ROOMS[s.room].spots.length;
}

if (typeof module !== "undefined") module.exports = {};
