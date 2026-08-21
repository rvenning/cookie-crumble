// Cookie Crumble — the shop.
//
// In a routing game the upgrades are unusually easy to reason about, because
// every one of them buys back the same thing: seconds. Faster shoes cut the walk,
// a bigger tray removes a walk entirely, softer chairs buy patience to spend on
// walking. That makes the shelf legible to a child — everything here means
// "you'll be less late" — and it makes the balance bots' job simple, because a
// kit is just six numbers.
//
// Nothing here is ever REQUIRED. Every shift is beatable on the starting kit;
// the shop only ever converts coins into slack.

const UPGRADES = [
  {
    id: "shoes", icon: "👟", name: "Comfy Shoes",
    desc: "Get across the room quicker. The best coins you'll spend.",
    costs: [90, 220, 420],
  },
  {
    id: "tray", icon: "🍽️", name: "Bigger Tray",
    desc: "Carry more plates at once, so one trip does two tables.",
    costs: [140, 340],
  },
  {
    id: "chairs", icon: "🪑", name: "Softer Chairs",
    desc: "Everyone waits a little longer without minding.",
    costs: [80, 190, 380],
  },
  {
    id: "kitchen", icon: "🔥", name: "Better Kitchen",
    desc: "The urn, the oven and the icing bench all work faster.",
    costs: [120, 280, 520],
  },
  {
    id: "podium", icon: "🪧", name: "Front Podium",
    desc: "One more guest can wait at the door instead of walking off.",
    costs: [110],
  },
  {
    id: "mop", icon: "🧽", name: "A Proper Mop",
    desc: "Clear a table in half the time. The twins will test this.",
    costs: [70, 170],
  },
];

// Trims are cosmetic and they actually go up in the room — the renovation idea
// from Chef & Friends, which costs almost nothing to build and is most of why
// the shop is fun to visit.
const TRIMS = [
  { id: "bunting",  icon: "🎏", name: "Bunting",       cost: 30 },
  { id: "plant",    icon: "🪴", name: "Window Plant",  cost: 35 },
  { id: "cat",      icon: "🐈", name: "Shop Cat",      cost: 45 },
  { id: "pictures", icon: "🖼️", name: "More Pictures", cost: 50 },
  { id: "flowers",  icon: "🌻", name: "Table Flowers", cost: 60 },
  { id: "clock",    icon: "🕰️", name: "Wall Clock",    cost: 65 },
  { id: "rug",      icon: "🧶", name: "Good Rug",      cost: 75 },
  { id: "board",    icon: "📋", name: "Chalkboard",    cost: 85 },
  { id: "stand",    icon: "🍰", name: "Cake Stand",    cost: 100 },
  { id: "birds",    icon: "🐦", name: "Birdcage",      cost: 120 },
  { id: "lamps",    icon: "🏮", name: "Paper Lanterns", cost: 150 },
  { id: "trophy",   icon: "🏆", name: "Tearoom of the Year", cost: 220 },
];

// The kitchen a brand-new player runs. Every shift is tuned against exactly this.
const BASE_KIT = {
  // Walking is half of everything she does, so this is the single most powerful
  // number in the game. At 150 the planner could only serve 3.3 parties a minute
  // in the full room and no schedule was survivable.
  walk: 175,      // logical px per second
  carry: 2,       // plates in hand
  patience: 0,    // extra seconds of goodwill
  cook: 1,        // multiplier on every station's time
  queue: 3,       // guests who'll wait at the door
  clear: 1,       // multiplier on clearing a table
};

function upgradeLevel(prog, id) {
  return ((prog && prog.upgrades) || {})[id] || 0;
}

// The kit a profile plays with. game.js takes this whole object and never reads
// progress itself, which is what lets a bot hand it any kitchen it likes —
// including the fixed one the Saturday Rush gives everybody.
function upgradeLoadout(prog) {
  const lvl = (id) => upgradeLevel(prog, id);
  return {
    walk: BASE_KIT.walk + 20 * lvl("shoes"),
    carry: BASE_KIT.carry + lvl("tray"),
    patience: 5 * lvl("chairs"),
    cook: Math.max(0.55, 1 - 0.12 * lvl("kitchen")),
    queue: BASE_KIT.queue + lvl("podium"),
    clear: Math.max(0.5, 1 - 0.18 * lvl("mop")),
  };
}

function hasTrim(prog, id) { return !!((prog && prog.trims) || {})[id]; }
function trimCount(prog) { return Object.keys((prog && prog.trims) || {}).length; }

// How many of a guest type you have served. Serving enough of one puts them in
// the album with their story — the Animal Restaurant half of the meta.
const ALBUM_AT = 8;
function metCount(prog, id) { return ((prog && prog.met) || {})[id] || 0; }
function knowsGuest(prog, id) { return metCount(prog, id) >= ALBUM_AT; }

if (typeof module !== "undefined") module.exports = {};
