// Shared sandbox loader. Every suite gets the same engine, in the same
// concatenation order as index.html — a file that reads another's top-level
// `const` crashes on load if the order drifts.

const path = require("node:path");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");

function load() {
  return loadScripts({
    baseDir: ROOT,
    files: [
      "tests/seed.js",
      "lib/gk-util.js",
      "js/recipes.js",
      "js/shifts.js",
      "js/upgrades.js",
      "js/game.js",
    ],
    exports: [
      "SHAPES", "SHAPE", "ICINGS", "ICING", "OVEN", "STATION", "SPRINKLE_MULT",
      "bakePhase", "bakeBands", "payFor", "bestPay", "dealOrders", "trayFills",
      "sameOrder", "orderSeconds",
      "WEEKS", "SHIFTS", "RUSH", "RUSH_UNLOCK_SHIFTS", "demandSeconds", "shiftsInWeek",
      "UPGRADES", "TRIMS", "BASE_KIT", "upgradeLoadout", "upgradeLevel",
      "Game", "CUT_TIME", "ICE_TIME", "SCORING",
      "__reseed", "__rand",
    ],
    browser: true,
    globals: {
      performance: { now: () => 0 },
      requestAnimationFrame() {},
    },
  });
}

module.exports = { load, ROOT };
