// Shared sandbox loader. Same concatenation order as index.html — a file that
// reads another's top-level `const` crashes on load if the order drifts.

const path = require("node:path");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");

function load() {
  return loadScripts({
    baseDir: ROOT,
    files: [
      "tests/seed.js",
      "lib/gk-util.js",
      "js/menu.js",
      "js/shifts.js",
      "js/upgrades.js",
      "js/game.js",
    ],
    exports: [
      "CLOTHS", "CLOTH", "DISHES", "DISH", "STATIONS", "STATION", "JOB",
      "GUESTS", "GUEST", "SCORE", "payout", "stationFor",
      "FIELD", "PASS", "DOOR", "QUEUE_SLOTS", "SERVER_HOME", "SPOTS", "ROOMS",
      "neighbours", "NEIGHBOUR_DIST", "WEEKS", "SHIFTS", "STAR_MULT",
      "RUSH", "RUSH_UNLOCK_SHIFTS", "shiftsInWeek", "pressure",
      "UPGRADES", "TRIMS", "BASE_KIT", "upgradeLoadout", "upgradeLevel",
      "hasTrim", "trimCount", "ALBUM_AT", "metCount", "knowsGuest",
      "Game", "PLATE_LIFE", "TASK_QUEUE", "DRAIN",
      "__reseed", "__rand",
    ],
    browser: true,
    globals: { performance: { now: () => 0 }, requestAnimationFrame() {} },
  });
}

module.exports = { load, ROOT };
