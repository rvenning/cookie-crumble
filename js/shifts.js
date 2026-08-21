// Cookie Crumble — the twenty shifts, in five weeks.
//
// A shift GRANTS its own ingredients. Today's cutters and icings arrive in the
// morning's shopping (`shapes` / `icings`), and nothing the shop sells is ever
// needed to fill an order. That is deliberate: an economy where a late shift
// wants a colour you chose not to buy is a game that can strand a child three
// weeks in, with no way back. The shop sells EQUIPMENT — speed, slots, slack —
// so everything there makes a shift easier and nothing makes one possible.
//
// The dial that actually sets the difficulty is neither `count` nor `gap`. It
// is how long the LAST person in the queue has to stand there, and the bots had
// to tell me what that costs, because my first guess was out by a factor of
// nearly two. One tray takes about eleven seconds to exist at all — mix 2.2,
// cut 0.8, bake ~6.2, ice 0.5, and the taps in between — so with `maxWaiting`
// people at the counter, the one at the back waits
//
//     latency + (maxWaiting - 1) × cycle
//
// where `cycle` is ~10s on the starting single oven and ~4.5s once three of them
// are running. Every `patience` below is that sum plus slack, which is why the
// numbers FALL as the campaign goes on while the shifts get harder: the shop is
// converting into cycle time faster than the counter is taking it away. I first
// authored these at 26-36s against an assumed 7.5s cycle and the progression bot
// hit a wall on shift five.

const WEEKS = [
  { name: "Opening Day",       icon: "🏪", hue: "#ffd84d",
    blurb: "Flour, butter, and your very first customers." },
  { name: "The Icing Aisle",   icon: "🎨", hue: "#ff8fbf",
    blurb: "Colours arrive. Now they care what it looks like." },
  { name: "Sprinkle Season",   icon: "✨", hue: "#7fc4ff",
    blurb: "Sprinkles on top — and two things to get right at once." },
  { name: "Party Orders",      icon: "🎈", hue: "#86dd8f",
    blurb: "Bigger crowds, fussier lists, less time to think." },
  { name: "The Grand Bake-Off", icon: "🏆", hue: "#ffa64d",
    blurb: "Every cutter, every colour, and the whole village watching." },
];

// shapes/icings   what today's shopping brought in
// count           customers this shift
// maxWaiting      how many can stand at the counter at once (arrivals wait)
// patience        seconds a customer waits once at the counter
// gap             seconds between scheduled arrivals, when there is room
// maxLost         lose more than this and the shift is a bust
// big             a Big Day: the week's finale, and the reason for the crowd
const SHIFTS = [
  /* ---- week 1: opening day. No icing table at all for two shifts. ---- */
  { name: "First Batch", week: 0, shapes: ["round"], icings: ["none"],
    count: 4, maxWaiting: 2, patience: 44, gap: 13, first: 2.5, maxLost: 2,
    tip: "Mix, cut, bake, serve. Watch the green stripe on the oven." },

  { name: "Two Cutters", week: 0, shapes: ["round", "star"], icings: ["none"],
    count: 5, maxWaiting: 2, patience: 42, gap: 12, first: 2.5, maxLost: 2,
    tip: "Check the card before you cut — a star is not a round." },

  { name: "Pink Icing In", week: 0, shapes: ["round", "star"], icings: ["none", "pink"],
    count: 6, maxWaiting: 2, patience: 42, gap: 12, first: 2.5, maxLost: 2,
    tip: "Baked cookies go on the icing table. Plain orders skip it." },

  { name: "The School Fete", week: 0, big: true, shapes: ["round", "star"], icings: ["none", "pink"],
    count: 8, maxWaiting: 3, patience: 40, gap: 10, first: 2, maxLost: 3,
    tip: "Three at the counter now. Keep the oven full!" },

  /* ---- week 2: the icing aisle ---- */
  { name: "Blue Monday", week: 1, shapes: ["round", "star", "heart"], icings: ["none", "pink", "blue"],
    count: 6, maxWaiting: 3, patience: 40, gap: 11, first: 2, maxLost: 3,
    tip: "Hearts are thin — they bake quicker than a round." },

  { name: "Lemon Tuesday", week: 1, shapes: ["round", "star", "heart"], icings: ["none", "pink", "blue", "yellow"],
    count: 7, maxWaiting: 3, patience: 39, gap: 10.5, first: 2, maxLost: 3 },

  { name: "Market Day", week: 1, shapes: ["round", "star", "heart"], icings: ["none", "pink", "blue", "yellow"],
    count: 8, maxWaiting: 3, patience: 38, gap: 10, first: 2, maxLost: 3 },

  { name: "Birthday Party", week: 1, big: true, shapes: ["round", "star", "heart"],
    icings: ["none", "pink", "blue", "yellow"],
    count: 10, maxWaiting: 3, patience: 37, gap: 9, first: 2, maxLost: 3,
    tip: "Ten orders. A cooling rack is worth every coin today." },

  /* ---- week 3: sprinkle season ---- */
  { name: "Sprinkles!", week: 2, shapes: ["round", "star", "heart", "flower"],
    icings: ["none", "pink", "blue", "yellow"], sprinkles: true,
    count: 8, maxWaiting: 3, patience: 38, gap: 10, first: 2, maxLost: 3,
    tip: "Sprinkles go on AFTER the icing. Some cards want none." },

  { name: "Flower Power", week: 2, shapes: ["round", "star", "heart", "flower"],
    icings: ["none", "pink", "blue", "yellow"], sprinkles: true,
    count: 8, maxWaiting: 3, patience: 37, gap: 9.5, first: 2, maxLost: 3 },

  { name: "Rainy Saturday", week: 2, shapes: ["round", "star", "heart", "flower"],
    icings: ["none", "pink", "blue", "yellow"], sprinkles: true,
    count: 9, maxWaiting: 3, patience: 36, gap: 9, first: 2, maxLost: 3 },

  { name: "The Village Show", week: 2, big: true, shapes: ["round", "star", "heart", "flower"],
    icings: ["none", "pink", "blue", "yellow"], sprinkles: true,
    count: 12, maxWaiting: 3, patience: 35, gap: 8.5, first: 2, maxLost: 4,
    tip: "Twelve orders and a judge watching. Bake them just right." },

  /* ---- week 4: party orders ---- */
  { name: "Moon Cutters", week: 3, shapes: ["round", "star", "heart", "flower", "moon"],
    icings: ["none", "pink", "blue", "yellow", "green"], sprinkles: true,
    count: 9, maxWaiting: 3, patience: 35, gap: 9, first: 2, maxLost: 3,
    tip: "Moons are the quickest bake in the shop. Don't wander off." },

  { name: "Mint Green", week: 3, shapes: ["round", "star", "heart", "flower", "moon"],
    icings: ["none", "pink", "blue", "yellow", "green"], sprinkles: true,
    count: 10, maxWaiting: 3, patience: 34, gap: 8.5, first: 2, maxLost: 3 },

  { name: "Sunday Rush", week: 3, shapes: ["round", "star", "heart", "flower", "moon"],
    icings: ["none", "pink", "blue", "yellow", "green"], sprinkles: true,
    count: 10, maxWaiting: 3, patience: 34, gap: 8.5, first: 2, maxLost: 3 },

  { name: "A Wedding", week: 3, big: true, shapes: ["round", "star", "heart", "flower", "moon"],
    icings: ["none", "pink", "blue", "yellow", "green"], sprinkles: true,
    count: 13, maxWaiting: 3, patience: 33, gap: 8, first: 2, maxLost: 4,
    tip: "Thirteen guests. Every one of them has an opinion." },

  /* ---- week 5: the grand bake-off ---- */
  { name: "Chocolate Arrives", week: 4, shapes: ["round", "star", "heart", "flower", "moon", "tree"],
    icings: ["none", "pink", "blue", "yellow", "green", "choc"], sprinkles: true,
    count: 10, maxWaiting: 3, patience: 34, gap: 8.5, first: 2, maxLost: 3,
    tip: "Trees take the longest bake of the lot. Start them early." },

  { name: "Six Colours", week: 4, shapes: ["round", "star", "heart", "flower", "moon", "tree"],
    icings: ["none", "pink", "blue", "yellow", "green", "choc"], sprinkles: true,
    count: 11, maxWaiting: 3, patience: 33, gap: 8, first: 2, maxLost: 3 },

  { name: "The Long Queue", week: 4, shapes: ["round", "star", "heart", "flower", "moon", "tree"],
    icings: ["none", "pink", "blue", "yellow", "green", "choc"], sprinkles: true,
    count: 12, maxWaiting: 3, patience: 32, gap: 8, first: 2, maxLost: 3 },

  { name: "The Grand Bake-Off", week: 4, big: true,
    shapes: ["round", "star", "heart", "flower", "moon", "tree"],
    icings: ["none", "pink", "blue", "yellow", "green", "choc"], sprinkles: true,
    count: 14, maxWaiting: 3, patience: 32, gap: 7.5, first: 2, maxLost: 4,
    tip: "This is the one. Everything you know, all at once." },
];

/* ---------------- The Big Rush ---------------- */

// The leaderboard mode, and the only place in the game with a shrinking clock.
// Patience decays geometrically with NO FLOOR: a floor would make the mode
// survivable forever for a good player and there would be no score to compare.
// Everyone plays it on the same fixed kitchen, so the shop can never buy a place
// on the board.
const RUSH = {
  shapes: ["round", "star", "heart", "flower", "moon", "tree"],
  icings: ["none", "pink", "blue", "yellow", "green", "choc"],
  sprinkles: true,
  maxWaiting: 3,
  gap: 5.5,
  first: 1.5,
  patienceStart: 22,
  patienceDecay: 0.975,
  mistakes: 3,           // customers you may lose before the shop closes
  kit: { mix: 2.2, ovens: 2, rack: 2, timer: 0, patience: 0, scraper: 0 },
};

const RUSH_UNLOCK_SHIFTS = 6;

function shiftsInWeek(w) {
  return SHIFTS.map((s, i) => [s, i]).filter(([s]) => s.week === w);
}

// What a shift demands of the kitchen, in seconds per tray. The whole difficulty
// curve is this one number, and the content linter asserts it only ever falls.
function demandSeconds(shift) {
  return shift.patience / shift.maxWaiting;
}

if (typeof module !== "undefined") module.exports = {};
