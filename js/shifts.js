// Cookie Crumble — the room, and the forty shifts played in it.
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

  // The back half. The room cannot grow past six tables, so these five weeks
  // earn their difficulty from CONTENT instead: a fifth dish on a fourth bench,
  // then three guests who each turn a background rule into a constraint.
  { name: "The Sandwich Board", icon: "🥪", hue: "#b9a3e0",
    blurb: "Lunch arrives, and a fourth bench with it." },
  { name: "Everyone's a Critic", icon: "🐈", hue: "#f0857a",
    blurb: "Which tablecloth somebody gets stops being your decision." },
  { name: "Nobody Sits Alone",  icon: "🦌", hue: "#6fc4a8",
    blurb: "One wants company, one can't stand it, and there are six tables." },
  { name: "Another Pot, Please", icon: "🐸", hue: "#8fa9d9",
    blurb: "Nobody is finished when you think they are finished." },
  { name: "Talk of the County", icon: "🏅", hue: "#d98fc4",
    blurb: "Everything you have learned, all at once, for people who came a long way." },
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
    count: 7, first: 2.0, gap: 10.4, patience: 39, target: 1170, maxLost: 2,
    tip: "Two things on the menu now. Put the oven on before anybody asks." },
  { name: "The Morning Train", week: 0, room: 0, dishes: ["tea", "cookie"], types: ["regular", "commuter"],
    count: 8, first: 2.0, gap: 9.4, patience: 37, target: 1220, maxLost: 3,
    tip: "The fox is in a hurry and tips double. Him first." },
  { name: "Saturday Opening", week: 0, big: true, room: 1, dishes: ["tea", "cookie"],
    types: ["regular", "commuter"],
    count: 10, first: 1.8, gap: 9.4, patience: 39, target: 1520, maxLost: 3,
    tip: "A fourth table. Match the cloth colour to the guest for a bonus." },

  /* ---- week 2 ---- */
  { name: "The Cake Trolley", week: 1, room: 1, dishes: ["tea", "cookie", "cake"],
    types: ["regular", "commuter"],
    count: 9, first: 2.0, gap: 9.9, patience: 39, target: 1280, maxLost: 3,
    tip: "Cake takes the longest. Start one whenever the icing bench is free." },
  { name: "Squirrel Weather", week: 1, room: 1, dishes: ["tea", "cookie", "cake"],
    types: ["regular", "commuter", "twins"],
    count: 10, first: 2.0, gap: 9.4, patience: 38, target: 1540, maxLost: 3,
    tip: "The twins leave crumbs — their table needs clearing twice." },
  { name: "Market Day", week: 1, room: 1, dishes: ["tea", "cookie", "cake"],
    types: ["regular", "commuter", "twins"],
    count: 11, first: 1.8, gap: 9.0, patience: 37, target: 1730, maxLost: 3 },
  { name: "The Village Fete", week: 1, big: true, room: 2, dishes: ["tea", "cookie", "cake"],
    types: ["regular", "commuter", "twins"],
    count: 13, first: 1.8, gap: 9.4, patience: 39, target: 1930, maxLost: 4,
    tip: "Five tables and no let-up. Keep all three benches working." },

  /* ---- week 3 ---- */
  { name: "Scones Are On", week: 2, room: 2, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins"],
    count: 11, first: 2.0, gap: 10.0, patience: 40, target: 1640, maxLost: 3,
    tip: "Four things on the menu and one oven. It can only make one at a time." },
  { name: "Old Friends", week: 2, room: 2, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "friends"],
    count: 12, first: 2.0, gap: 9.6, patience: 39, target: 2130, maxLost: 3,
    tip: "The badgers will sit all afternoon. Give them the far table." },
  { name: "A Prickly Customer", week: 2, room: 2, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "friends", "prickle"],
    count: 12, first: 1.9, gap: 9.2, patience: 38, target: 1920, maxLost: 3,
    tip: "Prickle upsets whoever sits near him. Put him somewhere on his own." },
  { name: "The Long Saturday", week: 2, big: true, room: 3, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "friends", "prickle"],
    count: 14, first: 1.8, gap: 11.9, patience: 47, target: 2610, maxLost: 4,
    tip: "Six tables at last. That's more room and a lot more walking." },

  /* ---- week 4 ---- */
  { name: "Party Season", week: 3, room: 3, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "friends", "birthday"],
    count: 12, first: 1.9, gap: 11.9, patience: 47, target: 2240, maxLost: 3,
    tip: "The bear wants everything at once — carry it all in one trip." },
  { name: "Someone Small", week: 3, room: 3, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "prickle", "birthday", "tiny"],
    count: 13, first: 1.8, gap: 11.4, patience: 46, target: 2500, maxLost: 3,
    tip: "The mouse has to be walked to her table. Worth it." },
  { name: "Rain All Day", week: 3, room: 3, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "friends", "prickle", "tiny"],
    count: 13, first: 1.8, gap: 11.0, patience: 45, target: 2430, maxLost: 3 },
  { name: "The Birthday Rush", week: 3, big: true, room: 3, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "friends", "birthday", "tiny"],
    count: 15, first: 1.7, gap: 10.6, patience: 44, target: 2770, maxLost: 4,
    tip: "Three birthdays booked in. Cake, cake and more cake." },

  /* ---- week 5 ---- */
  { name: "Word Gets Around", week: 4, room: 3, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "friends", "prickle", "birthday", "tiny"],
    count: 14, first: 1.8, gap: 11.2, patience: 45, target: 2620, maxLost: 3 },
  { name: "The Inspector Calls", week: 4, room: 3, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "friends", "birthday", "inspector"],
    count: 14, first: 1.7, gap: 10.8, patience: 44, target: 2840, maxLost: 3,
    tip: "The owl is watching. If she leaves unhappy, the day is a write-off." },
  { name: "Full House", week: 4, room: 3, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "friends", "prickle", "birthday", "tiny", "inspector"],
    count: 15, first: 1.7, gap: 10.8, patience: 45, target: 2840, maxLost: 3 },
  { name: "The Grand Re-Opening", week: 4, big: true, room: 3, dishes: ["tea", "cookie", "cake", "scone"],
    types: ["regular", "commuter", "twins", "friends", "prickle", "birthday", "tiny", "inspector"],
    count: 16, first: 1.6, gap: 10.8, patience: 45, target: 3200, maxLost: 4,
    tip: "Everybody, all at once. This is the one." },

  /* ---- week 6: the sandwich board ---- */
  // The gap opens back up for one shift. A new bench is a new habit, and the
  // place to learn it is not a shift that is already at the limit.
  { name: "The Sandwich Board", week: 5, room: 3, dishes: ["tea", "cookie", "cake", "scone", "sandwich"],
    types: ["regular", "commuter", "twins", "friends", "tiny"],
    count: 15, first: 1.9, gap: 11.6, patience: 47, target: 2780, maxLost: 3,
    tip: "A fourth bench, and sandwiches on it. Put it on before the lunch crowd." },
  { name: "Lunchtime", week: 5, room: 3, dishes: ["tea", "cookie", "cake", "scone", "sandwich"],
    types: ["regular", "commuter", "twins", "friends", "prickle", "tiny"],
    count: 16, first: 1.8, gap: 11.0, patience: 46, target: 3180, maxLost: 3 },
  { name: "Both Ovens Going", week: 5, room: 3, dishes: ["tea", "cookie", "cake", "scone", "sandwich"],
    types: ["regular", "commuter", "twins", "friends", "birthday", "tiny"],
    count: 17, first: 1.8, gap: 10.6, patience: 45, target: 3070, maxLost: 3,
    tip: "Five things on the menu and four benches. Nothing should ever be standing idle." },
  { name: "Saturday Lunch", week: 5, big: true, room: 3, dishes: ["tea", "cookie", "cake", "scone", "sandwich"],
    types: ["regular", "commuter", "twins", "friends", "prickle", "birthday", "tiny"],
    count: 18, first: 1.7, gap: 10.6, patience: 45, target: 3420, maxLost: 4,
    tip: "The busiest lunch yet. Keep all four going and you will be fine." },

  /* ---- week 7: everyone's a critic ---- */
  { name: "The Particular Cat", week: 6, room: 3, dishes: ["tea", "cookie", "cake", "scone", "sandwich"],
    types: ["regular", "commuter", "friends", "picky"],
    count: 16, first: 1.8, gap: 11.2, patience: 46, target: 3140, maxLost: 3,
    tip: "The cat wants the cloth she came in for. Any other colour and she is counting." },
  { name: "Colour Coded", week: 6, room: 3, dishes: ["tea", "cookie", "cake", "scone", "sandwich"],
    types: ["regular", "commuter", "twins", "tiny", "picky"],
    count: 17, first: 1.8, gap: 10.8, patience: 45, target: 2860, maxLost: 3 },
  { name: "A Long Queue", week: 6, room: 3, dishes: ["tea", "cookie", "cake", "scone", "sandwich"],
    types: ["regular", "commuter", "twins", "friends", "prickle", "picky"],
    count: 18, first: 1.7, gap: 10.4, patience: 44, target: 3640, maxLost: 3,
    tip: "Four at the door and one of them fussy. Sometimes the right table is worth the wait." },
  { name: "The Cat's Saturday", week: 6, big: true, room: 3, dishes: ["tea", "cookie", "cake", "scone", "sandwich"],
    types: ["regular", "commuter", "twins", "friends", "birthday", "tiny", "picky"],
    count: 19, first: 1.7, gap: 10.4, patience: 44, target: 3830, maxLost: 4 },

  /* ---- week 8: nobody sits alone ---- */
  { name: "The Shy One", week: 7, room: 3, dishes: ["tea", "cookie", "cake", "scone", "sandwich"],
    types: ["regular", "commuter", "friends", "tiny", "shy"],
    count: 17, first: 1.8, gap: 11.0, patience: 46, target: 3250, maxLost: 3,
    tip: "The deer does not want to be on his own. Sit him next to somebody." },
  // Prickle and the deer in the same room is the whole point of the week: one
  // needs an empty neighbour, the other needs a full one.
  { name: "Neighbours", week: 7, room: 3, dishes: ["tea", "cookie", "cake", "scone", "sandwich"],
    types: ["regular", "commuter", "twins", "prickle", "shy"],
    count: 18, first: 1.7, gap: 10.6, patience: 45, target: 3350, maxLost: 3,
    tip: "Prickle wants nobody beside him and the deer wants somebody. Opposite ends." },
  { name: "Corner Table", week: 7, room: 3, dishes: ["tea", "cookie", "cake", "scone", "sandwich"],
    types: ["regular", "commuter", "twins", "friends", "prickle", "picky", "shy"],
    count: 18, first: 1.7, gap: 10.2, patience: 44, target: 3560, maxLost: 3 },
  { name: "A Room Full of Opinions", week: 7, big: true, room: 3, dishes: ["tea", "cookie", "cake", "scone", "sandwich"],
    types: ["regular", "commuter", "twins", "friends", "prickle", "birthday", "tiny", "picky", "shy"],
    count: 20, first: 1.6, gap: 10.2, patience: 44, target: 3960, maxLost: 4,
    tip: "Everybody wants something about where they sit. Somebody is going to be disappointed." },

  /* ---- week 9: another pot, please ---- */
  // Second helpings costs four extra jobs rather than a table, so the arrival
  // gap opens rather than tightens here — the pressure is on the server, not the
  // door, and stacking both makes an unwinnable shift instead of a hard one.
  { name: "Second Helpings", week: 8, room: 3, dishes: ["tea", "cookie", "cake", "scone", "sandwich"],
    types: ["regular", "commuter", "friends", "tiny", "seconds"],
    count: 17, first: 1.8, gap: 11.2, patience: 46, target: 3450, maxLost: 3,
    tip: "The frog orders again after he has eaten. Watch for the table that goes back to a ?" },
  { name: "One More Thing", week: 8, room: 3, dishes: ["tea", "cookie", "cake", "scone", "sandwich"],
    types: ["regular", "commuter", "twins", "picky", "seconds"],
    count: 18, first: 1.8, gap: 10.8, patience: 45, target: 3580, maxLost: 3 },
  { name: "Nobody's Leaving", week: 8, room: 3, dishes: ["tea", "cookie", "cake", "scone", "sandwich"],
    types: ["regular", "commuter", "twins", "friends", "shy", "seconds"],
    count: 18, first: 1.7, gap: 10.4, patience: 44, target: 4070, maxLost: 3,
    tip: "Badgers who sit all day and a frog who orders twice. Tables are the scarce thing today." },
  { name: "The Long Afternoon", week: 8, big: true, room: 3, dishes: ["tea", "cookie", "cake", "scone", "sandwich"],
    types: ["regular", "commuter", "twins", "friends", "prickle", "birthday", "tiny", "picky", "seconds"],
    count: 20, first: 1.6, gap: 10.4, patience: 44, target: 3750, maxLost: 4 },

  /* ---- week 10: talk of the county ---- */
  { name: "Word Travels", week: 9, room: 3, dishes: ["tea", "cookie", "cake", "scone", "sandwich"],
    types: ["regular", "commuter", "twins", "friends", "prickle", "tiny", "picky", "shy", "seconds"],
    count: 19, first: 1.7, gap: 10.6, patience: 45, target: 3830, maxLost: 3 },
  { name: "A Coachload", week: 9, room: 3, dishes: ["tea", "cookie", "cake", "scone", "sandwich"],
    types: ["regular", "commuter", "twins", "friends", "birthday", "tiny", "picky", "shy", "seconds"],
    count: 20, first: 1.6, gap: 10.2, patience: 44, target: 3970, maxLost: 3,
    tip: "Twenty in, one after another. Do not let a single bench stand still." },
  { name: "The Inspector Returns", week: 9, room: 3, dishes: ["tea", "cookie", "cake", "scone", "sandwich"],
    types: ["regular", "commuter", "twins", "friends", "prickle", "birthday", "picky", "shy", "seconds", "inspector"],
    count: 20, first: 1.6, gap: 10.2, patience: 44, target: 4390, maxLost: 3,
    tip: "She is back, and she has heard a lot about you since." },
  { name: "The Last Saturday", week: 9, big: true, room: 3, dishes: ["tea", "cookie", "cake", "scone", "sandwich"],
    types: ["regular", "commuter", "twins", "friends", "prickle", "birthday", "tiny", "inspector", "picky", "shy", "seconds"],
    count: 22, first: 1.5, gap: 10.0, patience: 44, target: 4200, maxLost: 4,
    tip: "Every guest you have ever served, on the busiest day the tearoom has had." },
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
