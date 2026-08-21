// Cookie Crumble — the Corner Shop.
//
// Nothing here is ever REQUIRED. Every shift arrives with the cutters and icings
// its orders need, so the shop only ever sells slack: a quicker mixer, another
// oven, a wider "just right" window, a customer who waits a bit longer. A child
// who spends nothing can still finish the campaign — she just does it on one
// star instead of three, which is the difference the bots are tuned against.
//
// Costs climb steeply within an upgrade so the first level of everything is
// affordable long before the second level of anything, and the interesting
// question is which corner of the kitchen to fix next.

const UPGRADES = [
  {
    id: "mixer", icon: "🥣", name: "Big Mixer",
    desc: "Mixing a bowl of dough is quicker.",
    costs: [40, 95, 180],
  },
  {
    id: "oven", icon: "🔥", name: "Another Oven",
    desc: "One more oven shelf — bake two trays, then three.",
    costs: [130, 320],
  },
  {
    id: "rack", icon: "🧊", name: "Cooling Rack",
    desc: "Somewhere to park a tray when your hands are full.",
    costs: [65, 155],
  },
  {
    id: "timer", icon: "⏲️", name: "Kitchen Timer",
    desc: "A wider green stripe — longer to catch a perfect bake.",
    costs: [75, 160, 275],
  },
  {
    id: "sign", icon: "🪧", name: "Shop Sign",
    desc: "A prettier shop. Customers are happy to wait longer.",
    costs: [55, 125, 230],
  },
  {
    id: "scraper", icon: "🥄", name: "Icing Scraper",
    desc: "Scrape the wrong colour off and ice it again. Twice a shift.",
    costs: [85, 190],
  },
];

// Shop trims: pure decoration, bought with the same coins. They change nothing
// at all, and that is the point — somewhere for a child who likes collecting to
// spend her money without buying difficulty away.
const TRIMS = [
  { id: "bunting",  icon: "🎏", name: "Bunting",        cost: 25 },
  { id: "cat",      icon: "🐈", name: "Shop Cat",       cost: 30 },
  { id: "plant",    icon: "🪴", name: "Window Plant",   cost: 30 },
  { id: "clock",    icon: "🕰️", name: "Wall Clock",     cost: 35 },
  { id: "flowers",  icon: "🌻", name: "Sunflowers",     cost: 40 },
  { id: "balloons", icon: "🎈", name: "Balloons",       cost: 45 },
  { id: "cake",     icon: "🎂", name: "Window Cake",    cost: 55 },
  { id: "teapot",   icon: "🫖", name: "Big Teapot",     cost: 60 },
  { id: "rainbow",  icon: "🌈", name: "Rainbow Awning", cost: 70 },
  { id: "medal",    icon: "🏅", name: "Baking Medal",   cost: 90 },
  { id: "chandel",  icon: "💡", name: "Fancy Lamp",     cost: 110 },
  { id: "crown",    icon: "👑", name: "Golden Crown",   cost: 150 },
];

const BASE_KIT = {
  mix: 2.2,        // seconds to mix a bowl of dough
  ovens: 1,        // oven shelves
  rack: 1,         // cooling-rack parking slots
  timer: 0,        // extra seconds on the perfect window
  patience: 0,     // extra seconds every customer will wait
  scraper: 0,      // re-icings available per shift
};

function upgradeLevel(prog, id) {
  return ((prog && prog.upgrades) || {})[id] || 0;
}

// The kitchen a profile actually plays with. game.js takes this whole object and
// never reads progress itself, which is what lets a bot hand it any kitchen it
// likes — including the fixed one The Big Rush gives everybody.
function upgradeLoadout(prog) {
  const lvl = (id) => upgradeLevel(prog, id);
  return {
    mix: Math.max(0.7, BASE_KIT.mix - 0.5 * lvl("mixer")),
    ovens: 1 + lvl("oven"),
    rack: 1 + lvl("rack"),
    timer: 0.6 * lvl("timer"),
    patience: 2.5 * lvl("sign"),
    scraper: lvl("scraper"),
  };
}

function hasTrim(prog, id) { return !!((prog && prog.trims) || {})[id]; }
function trimCount(prog) { return Object.keys((prog && prog.trims) || {}).length; }

if (typeof module !== "undefined") module.exports = {};
