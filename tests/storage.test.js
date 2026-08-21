// Cookie Crumble — the save file.
//
// PROGRESS.merge is the one function in the game that can permanently destroy
// something: it runs on every device sync, and a wrong max() silently hands back
// coins that were already spent or forgets a star that was already earned. It is
// exported as a named object precisely so this suite can call it, because
// createStorage keeps its callbacks in a closure where nothing can reach them.

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");

// storage.js calls GK.createStorage at load time, so the kit and the registries
// it reads have to come with it, in index.html's order.
const S = loadScripts({
  baseDir: ROOT,
  files: [
    "lib/gk-util.js", "lib/gk-audio.js", "lib/gk-ui.js", "lib/gk-storage.js",
    "js/recipes.js", "js/shifts.js", "js/upgrades.js", "js/storage.js",
  ],
  exports: ["PROGRESS", "Storage", "UPGRADES", "TRIMS", "SHIFTS", "RUSH_UNLOCK_SHIFTS"],
  browser: true,
  globals: { performance: { now: () => 0 }, requestAnimationFrame() {} },
});

const { PROGRESS, Storage, UPGRADES, SHIFTS } = S;
const blank = () => PROGRESS.blank();

test("two devices that both played keep the best of everything", () => {
  const a = { ...blank(), coinsEarned: 300, coinsSpent: 120, rushScore: 400, rushBest: 18,
    shifts: { 0: { stars: 3, best: 90 }, 1: { stars: 1, best: 60 } },
    upgrades: { mixer: 2, oven: 0 }, trims: { cat: 1 } };
  const b = { ...blank(), coinsEarned: 260, coinsSpent: 190, rushScore: 350, rushBest: 22,
    shifts: { 1: { stars: 3, best: 55 }, 2: { stars: 2, best: 70 } },
    upgrades: { mixer: 1, oven: 1 }, trims: { plant: 1 } };

  for (const [x, y] of [[a, b], [b, a]]) {
    const m = PROGRESS.merge(x, y);
    assert.equal(m.coinsEarned, 300);
    assert.equal(m.coinsSpent, 190);
    assert.equal(m.rushScore, 400);
    assert.equal(m.rushBest, 22);
    assert.equal(m.shifts[0].stars, 3);
    assert.equal(m.shifts[1].stars, 3, "a star earned on one device was lost");
    assert.equal(m.shifts[1].best, 60, "the better takings were lost");
    assert.equal(m.shifts[2].stars, 2);
    assert.equal(m.upgrades.mixer, 2);
    assert.equal(m.upgrades.oven, 1);
    assert.deepEqual(Object.keys(m.trims).sort(), ["cat", "plant"]);
  }
});

test("spent coins stay spent", () => {
  // The bug this guards against: store a BALANCE and max() it, and buying the
  // second oven on the iPad then hands the coins back on the phone. Both sides
  // of the ledger are monotonic instead, and the balance is derived.
  const phone = { ...blank(), coinsEarned: 500, coinsSpent: 0 };
  const ipad = PROGRESS.merge(phone, { ...phone });
  assert.equal(Storage.coins(ipad), 500);

  const spent = { ...ipad, coinsSpent: 320, upgrades: { oven: 1 } };
  const merged = PROGRESS.merge(spent, phone);          // stale device syncs in
  assert.equal(Storage.coins(merged), 180, "spending 320 coins was undone by a sync");
  assert.equal(merged.upgrades.oven, 1, "the oven she paid for vanished");

  // ...and the other argument order, because which device syncs first is a coin
  // toss and an order-dependent merge is a coin toss over her save.
  assert.equal(Storage.coins(PROGRESS.merge(phone, spent)), 180);
});

test("a field a newer build adds survives an older client's merge", () => {
  const older = blank();
  const newer = { ...blank(), somethingNew: 7 };
  assert.equal(PROGRESS.merge(older, newer).somethingNew, 7);
});

test("the balance never goes negative, whatever the ledger says", () => {
  assert.equal(Storage.coins({ coinsEarned: 10, coinsSpent: 99 }), 0);
  assert.equal(Storage.coins({}), 0);
});

test("shifts unlock one at a time, and only a pass unlocks the next", () => {
  assert.equal(Storage.unlockedShift(blank()), 0);
  assert.equal(Storage.unlockedShift({ shifts: { 0: { stars: 1 } } }), 1);
  // Passing a later one out of order (via the debug jump) must not roll her back.
  assert.equal(Storage.unlockedShift({ shifts: { 0: { stars: 1 }, 4: { stars: 3 } } }), 5);
  // And it can never point past the end of the campaign.
  const all = Object.fromEntries(SHIFTS.map((_, i) => [i, { stars: 3 }]));
  assert.equal(Storage.unlockedShift({ shifts: all }), SHIFTS.length - 1);
});

test("The Big Rush stays locked until she has run the shop a few times", () => {
  assert.equal(Storage.rushUnlocked(blank()), false);
  const some = Object.fromEntries(
    Array.from({ length: S.RUSH_UNLOCK_SHIFTS }, (_, i) => [i, { stars: 1 }]));
  assert.equal(Storage.rushUnlocked({ shifts: some }), true);
});

test("a blank save can afford nothing, and every upgrade starts at zero", () => {
  const p = blank();
  assert.equal(Storage.coins(p), 0);
  assert.equal(Storage.totalStars(p), 0);
  for (const u of UPGRADES) assert.equal((p.upgrades || {})[u.id] || 0, 0);
});
