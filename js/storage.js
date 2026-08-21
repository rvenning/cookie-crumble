// Persistence: gamekit storage (lib/gk-storage.js) configured for Cookie
// Crumble. ck_* localStorage keys, "cookiecrumble" Firestore collection.
//
// Coins are SPENT in the Corner Shop, so a plain max() merge would resurrect
// them every time two devices sync — buy the second oven on the iPad, open the
// phone, and the coins are back. Both sides of the ledger are monotonic counters
// instead (coinsEarned and coinsSpent only ever grow) and the balance is
// derived, which makes max() correct by construction.
//
// PROGRESS is a named object rather than two inline callbacks because
// createStorage keeps them in its closure and never exposes them — and this is
// the one function in the game that can permanently destroy a save, so
// tests/storage.test.js has to be able to call it.

const PROGRESS = {
  blank: () => ({
    coinsEarned: 0, coinsSpent: 0,
    shifts: {},          // { [idx]: { stars, best } } — best result per shift
    upgrades: {},        // { [upgradeId]: level }
    trims: {},           // { [trimId]: 1 }
    rushBest: 0,         // customers served in the longest Big Rush
    rushScore: 0,        // the leaderboard number
    updated: 0,
  }),

  merge: (a, b) => {
    const shifts = { ...(a.shifts || {}) };
    for (const [idx, s] of Object.entries(b.shifts || {})) {
      const cur = shifts[idx];
      shifts[idx] = cur
        ? { stars: Math.max(cur.stars || 0, s.stars || 0), best: Math.max(cur.best || 0, s.best || 0) }
        : s;
    }
    const upgrades = { ...(a.upgrades || {}) };
    for (const [id, lvl] of Object.entries(b.upgrades || {}))
      upgrades[id] = Math.max(upgrades[id] || 0, lvl);

    return {
      // Spread first, so a field a newer build added survives an older client's
      // merge instead of being dropped on the next sync.
      ...a, ...b,
      coinsEarned: Math.max(a.coinsEarned || 0, b.coinsEarned || 0),
      coinsSpent: Math.max(a.coinsSpent || 0, b.coinsSpent || 0),
      rushBest: Math.max(a.rushBest || 0, b.rushBest || 0),
      rushScore: Math.max(a.rushScore || 0, b.rushScore || 0),
      shifts, upgrades,
      // A trim is never un-bought, so the union is always right.
      trims: { ...(a.trims || {}), ...(b.trims || {}) },
    };
  },
};

const Storage = GK.createStorage({
  prefix: "ck",
  collection: "cookiecrumble",
  firebaseConfig: window.FIREBASE_CONFIG,
  blankProgress: PROGRESS.blank,
  mergeProgress: PROGRESS.merge,
});

/* ----- Cookie Crumble helpers on top of the kit storage ----- */
Object.assign(Storage, {
  coins(prog) { return Math.max(0, (prog.coinsEarned || 0) - (prog.coinsSpent || 0)); },

  totalStars(prog) {
    return Object.values(prog.shifts || {}).reduce((s, x) => s + (x.stars || 0), 0);
  },

  shiftsWon(prog) { return Object.keys(prog.shifts || {}).length; },

  // Shifts unlock in order: the one after the highest she has passed.
  unlockedShift(prog) {
    let max = -1;
    for (const k of Object.keys(prog.shifts || {})) max = Math.max(max, Number(k));
    return Math.min(max + 1, SHIFTS.length - 1);
  },

  rushUnlocked(prog) { return this.shiftsWon(prog) >= RUSH_UNLOCK_SHIFTS; },

  // Coins are banked the moment they are won, not at the end of the shift, so
  // the counter moves while she plays and a shift that collapses still keeps
  // what it earned along the way. It is also what makes replaying an old shift
  // a real way to save up for the second oven.
  addCoins(profileId, amount) {
    if (!amount) return this.getProgress(profileId);
    const prog = this.getProgress(profileId);
    prog.coinsEarned = (prog.coinsEarned || 0) + amount;
    this.saveProgress(profileId, prog);
    return prog;
  },

  // Only a PASS is recorded, because recording a failed shift would unlock the
  // next one.
  recordShift(profileId, result) {
    const prog = this.getProgress(profileId);

    if (result.mode === "rush") {
      prog.rushBest = Math.max(prog.rushBest || 0, result.served || 0);
      prog.rushScore = Math.max(prog.rushScore || 0, result.score || 0);
    } else if (result.win) {
      const cur = prog.shifts[result.shiftIdx];
      prog.shifts[result.shiftIdx] = {
        stars: Math.max((cur && cur.stars) || 0, result.stars || 0),
        best: Math.max((cur && cur.best) || 0, result.score || 0),
      };
    }

    this.saveProgress(profileId, prog);
    return prog;
  },

  buyUpgrade(profileId, id) {
    const prog = this.getProgress(profileId);
    const def = UPGRADES.find((u) => u.id === id);
    const lvl = upgradeLevel(prog, id);
    if (!def || lvl >= def.costs.length) return { ok: false, reason: "maxed" };
    const cost = def.costs[lvl];
    if (this.coins(prog) < cost) return { ok: false, reason: "coins" };
    prog.coinsSpent = (prog.coinsSpent || 0) + cost;
    prog.upgrades = prog.upgrades || {};
    prog.upgrades[id] = lvl + 1;
    this.saveProgress(profileId, prog);
    return { ok: true, progress: prog, cost };
  },

  buyTrim(profileId, id) {
    const prog = this.getProgress(profileId);
    const def = TRIMS.find((t) => t.id === id);
    if (!def) return { ok: false, reason: "unknown" };
    if (hasTrim(prog, id)) return { ok: false, reason: "owned" };
    if (this.coins(prog) < def.cost) return { ok: false, reason: "coins" };
    prog.coinsSpent = (prog.coinsSpent || 0) + def.cost;
    prog.trims = prog.trims || {};
    prog.trims[id] = 1;
    this.saveProgress(profileId, prog);
    return { ok: true, progress: prog, cost: def.cost };
  },
});
